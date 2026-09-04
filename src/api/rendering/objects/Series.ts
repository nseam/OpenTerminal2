import * as Gfx from 'three';
import { Bar } from './Bar';
import { type TesterValuesColumns } from 'fx31337-wasm/lib/types/TesterValuesColumns';
import { type Chart } from './Chart';
import { Renderer } from './../Renderer';

/**
 * A series of OHLC bars rendered efficiently using InstancedMesh.
 * All bar boxes are drawn in a single draw call, and all vertical lines
 * share one LineSegments buffer for another single draw call.
 */
export class Series extends Gfx.Object3D
{
    // Unique identifier for the series. It's not the id of the Object3D as we need the id to be persistent across sessions.
    public uuid: string = crypto.randomUUID();

    // Pool of bar data objects. Grows to the historical maximum but never shrinks,
    // so Bar objects are reused across zoom changes without re-allocation.
    public bars: Bar[] = [];

    /**
     * The chart to which this series belongs.
     */
    public chart: Chart;

    /** Number of currently allocated bars */
    private numBarsAllocated: number = 0;

    /**
     * Frame id (see Renderer.frameId) at which updateFade() was last run, used to avoid redoing
     * that work when updateMatrixWorld() is invoked multiple times within the same real frame
     * (e.g. by SSAA's multiple internal render() calls).
     */
    private lastUpdatedFrameId: number = -1;

    /** Shared unit-cube geometry for InstancedMesh with per-instance opacity. */
    private gfxCubeGeometry: Gfx.BoxGeometry = (() => {
        const geo = new Gfx.BoxGeometry(1, 1, 1);
        // Create the opacity InstancedBufferAttribute with fill(1). All cubes default to fully opaque.
        geo.setAttribute('opacity', new Gfx.InstancedBufferAttribute(new Float32Array(16).fill(1), 1));
        return geo;
    })();

    /** Single InstancedMesh that renders all bar boxes. */
    private cubeMesh: Gfx.InstancedMesh | null = null;

    /** Shared material for the instanced bars — transparent so edge-fade uses alpha. */
    private gfxMaterialCube = Series.createCubeMaterial();

    /** BufferGeometry holding all vertical lines as LineSegments pairs. */
    private gfxLineGeometry: Gfx.BufferGeometry | null = null;

    /** Single LineSegments that renders all bar wicks. */
    private gfxLineMesh: Gfx.LineSegments | null = null;

    /** Material for the line mesh (tracked for proper disposal). */
    private gfxMaterialLine: Gfx.LineBasicMaterial | null = null;

    /** Temporary color reused when setting instance colors. */
    private _tempColor = new Gfx.Color();

    /** Allocated GPU buffer capacity in number of bars — only grows, never shrinks on zoom. */
    private numAllocatedCubes: number = 0;

    /** Allocated GPU buffer capacity in number of lines — only grows, never shrinks on zoom. */
    private numAllocatedLines: number = 0;

    /** The chart width and height used during the last layout pass (for line rendering). */
    public _chartWidth: number = 1;
    public _chartHeight: number = 1;

    /** The data for this series, stored as an array of TesterValuesColumns. */
    public data: TesterValuesColumns[] = [];

    /** Constructor. */
    public constructor(chart: Chart) {
        super();

        this.chart = chart;
    }

    /**
     * Creates the shared box material with per-instance alpha support via shader injection.
     */
    private static createCubeMaterial(): Gfx.MeshLambertMaterial {
        const mat = new Gfx.MeshLambertMaterial({ transparent: true });
        mat.onBeforeCompile = (shader) => {
            // Inject instance color attribute so per-instance colors are read.
            shader.vertexShader =
                'varying vec3 vInstanceColor;\n' +
                'attribute float opacity;\n' +
                'varying float vopacity;\n' +
                shader.vertexShader.replace(
                    'void main() {',
                    'void main() {\nvInstanceColor = instanceColor.xyz;\n' +'vopacity = opacity;'
                );
            // Multiply the diffuse color by per-instance color in fragment shader.
            shader.fragmentShader =
                'varying vec3 vInstanceColor;\n' +
                'varying float vopacity;\n' +
                shader.fragmentShader.replace(
                    '#include <premultiplied_alpha_fragment>',
                    'gl_FragColor.rgb = vInstanceColor;\n' +
                    'gl_FragColor.a *= vopacity;\n' +
                    '#include <premultiplied_alpha_fragment>'
                );
        };

        return mat;
    }

    /**
     * Creates a line material with per-vertex alpha support via shader injection.
     */
    private static createLineMaterial(): Gfx.LineBasicMaterial {
        const mat = new Gfx.LineBasicMaterial({ vertexColors: true, transparent: true });
        mat.onBeforeCompile = (shader) => {
            shader.vertexShader =
                'attribute float opacity;\nvarying float vOpacity;\n' +
                shader.vertexShader.replace(
                    'void main() {',
                    'void main() {\n\tvOpacity = opacity;'
                );
            shader.fragmentShader =
                'varying float vOpacity;\n' +
                shader.fragmentShader.replace(
                    '#include <premultiplied_alpha_fragment>',
                    'gl_FragColor.a *= vOpacity;\n#include <premultiplied_alpha_fragment>'
                );
        };
        return mat;
    }

    /**
     * Sets the data for this series. The data is stored as an array of TesterValuesColumns, which contains the OHLC values for each bar.
     * 
     * @param data The data to set for this series.
     */
    public setData(data: TesterValuesColumns[]): void {
        this.data = data;

        this.updateGraphics();
    }

    /**
     * Updates the graphics for the series, including layout, instance matrices, and line geometry.
     */
    public updateGraphics(): void {
        // Ensures that instanced meshes for cubes and lines have sufficient capacity.
        this.setBarsCapacity(this.chart.numBarsVisible);

        // Layout bars cubes.
        this.layoutBars();

        this.updateColors();

        // Update lines for bars.
        this.updateLines();

        // Update all instance matrices and colors.
        this.updateCubes();
    }

    /**
     * Ensures the InstancedMesh capacity is at least `count`. Only reallocates when the
     * requested count exceeds the current GPU buffer size. Otherwise reuses the existing
     * buffer and adjusts the draw count via `InstancedMesh.count`.
     */
    private setCubesCapacity(count: number): void {
        if (this.cubeMesh === null) {
            this.cubeMesh = new Gfx.InstancedMesh(this.gfxCubeGeometry, this.gfxMaterialCube, count);
            this.cubeMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);
            this.add(this.cubeMesh);
        }
        
        if (count > this.numAllocatedCubes) {
            // Allocate a new InstancedMesh with the increased capacity and copy existing instance data.
            const oldMesh = this.cubeMesh;
            const oldNumAllocatedCubes = this.numAllocatedCubes;

            this.cubeMesh = new Gfx.InstancedMesh(this.gfxCubeGeometry, this.gfxMaterialCube, count);

            // Setting the usage of the instance matrix to dynamic draw for efficient updates.
            this.cubeMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);

            const targetMatrix = new Gfx.Matrix4();

            for (let i = 0; i < oldNumAllocatedCubes; i++) {
                oldMesh.getMatrixAt(i, targetMatrix);
                this.cubeMesh.setMatrixAt(i, targetMatrix);

                if (oldMesh.instanceColor && this.cubeMesh.instanceColor) {
                    oldMesh.getColorAt(i, this._tempColor);
                    this.cubeMesh.setColorAt(i, this._tempColor);
                }
            }

            this.cubeMesh.instanceMatrix.needsUpdate = true;

            if (this.cubeMesh.instanceColor)
                this.cubeMesh.instanceColor.needsUpdate = true;

            oldMesh.parent?.remove(oldMesh);

            this.add(this.cubeMesh);

            this.numAllocatedCubes = count;
        }

        // Ensure per-instance opacity attribute on cube geometry has enough capacity.
        const currentOpacityAttr = this.gfxCubeGeometry.getAttribute('opacity') as Gfx.InstancedBufferAttribute | null;
        if (currentOpacityAttr && count > currentOpacityAttr.count) {
            // Grow the opacity array to match the new capacity.
            const newOpacityArray = new Float32Array(count).fill(1);
            this.gfxCubeGeometry.setAttribute('opacity', new Gfx.InstancedBufferAttribute(newOpacityArray, 1));
        } else if (!currentOpacityAttr) {
            // Fallback: should not happen since we init in the constructor, but just in case.
            this.gfxCubeGeometry.setAttribute('opacity', new Gfx.InstancedBufferAttribute(new Float32Array(count).fill(1), 1));
        }

        this.cubeMesh.count = count;
    }

    /**
     * Ensures the LineSegments buffer capacity is at least `count`. Only reallocates when the
     * requested count exceeds the current GPU buffer size. Otherwise reuses the existing
     * buffer and adjusts the draw range via `setDrawRange`.
     */
    private setLinesCapacity(count: number): void {
        if (this.gfxLineMesh === null || count > this.numAllocatedLines) {
            // Dispose old material and geometry.
            if (this.gfxMaterialLine) {
                this.gfxMaterialLine.dispose();
                this.gfxMaterialLine = null;
            }

            // Dispose old geometry if it exists.
            if (this.gfxLineGeometry) {
                this.gfxLineGeometry.dispose();
                this.gfxLineGeometry = null;
            }

            // Remove old mesh from the scene if it exists.
            if (this.gfxLineMesh) {
                this.remove(this.gfxLineMesh);
                this.gfxLineMesh = null;
            }

            // Create new geometry and buffers sized to the new capacity.
            this.gfxLineGeometry = new Gfx.BufferGeometry();

            const attributePosition = new Gfx.BufferAttribute(new Float32Array(count * 6), 3);
            const attributeColor = new Gfx.BufferAttribute(new Float32Array(count * 6), 3);
            const attributeOpacity = new Gfx.BufferAttribute(new Float32Array(count * 2).fill(1), 1);

            this.gfxLineGeometry.setAttribute('position', attributePosition);
            this.gfxLineGeometry.setAttribute('color', attributeColor);
            this.gfxLineGeometry.setAttribute('opacity', attributeOpacity);

            this.gfxMaterialLine = Series.createLineMaterial();

            this.gfxLineMesh = new Gfx.LineSegments(this.gfxLineGeometry, this.gfxMaterialLine);

            this.add(this.gfxLineMesh);

            this.numAllocatedLines = count;
        }

        // Always update the draw range to exactly the requested count — no reallocation needed.
        this.gfxLineGeometry!.setDrawRange(0, count * 2);
    }

    /**
     * Ensures InstancedMesh and LineSegments buffers can hold at least `count` bars.
     * Buffers only grow — they are never shrunk on zoom. The visible draw count is
     * adjusted via `InstancedMesh.count` / `setDrawRange` to avoid GPU reallocations.
     */
    private setBarsCapacity(count: number): void {
        if (count <= this.numBarsAllocated)
            return;

        console.log(`Setting bars capacity to ${count}`);

        this.bars = new Array(count).fill(null).map(() => new Bar());
        
        this.setCubesCapacity(count);
        this.setLinesCapacity(count);

        this.numBarsAllocated = count;
    }

    /**
     * Gets the matrix for a given instance index (from either old or new InstancedMesh).
     */
    private getCubeMatrixAtIndex(index: number): Gfx.Matrix4 {
        const boxMatrix = new Gfx.Matrix4();
        this.cubeMesh!.getMatrixAt(index, boxMatrix);
        return boxMatrix;
    }

    /**
     * Gets the color for a given instance index.
     */
    private getBarColorAtIndex(index: number): Gfx.Color {
        const barColor = new Gfx.Color();
        this.cubeMesh!.getColorAt(index, barColor);
        return barColor;
    }

    /**
     * Computes fade alpha for a bar, fading near all four chart edges (left, right, top, bottom).
     * Returns 0 when the bar falls completely outside the chart bounds on either axis.
     * `posX`/`minY`/`maxY` are Series-local coordinates; this.position offsets (applied by
     * Chart for scrolling) are added to compare against the Chart's own bounding box.
     */
    private computeEdgeFadeAlpha(posX: number, minY: number, maxY: number): number {
        const bbox = this.chart.getBBox();

        const worldX = this.position.x + posX;
        const worldMinY = this.position.y + minY;
        const worldMaxY = this.position.y + maxY;

        const fadeDistanceX = this.chart.verticalLineDistance / 4;
        const fadeDistanceY = this.chart.horizontalLineDistance / 4;

        const distToEdgeX = Math.min(worldX - bbox.min.x, bbox.max.x - worldX);
        if (distToEdgeX <= 0)
            return 0;

        let alpha = Math.min(1.0, Math.pow(distToEdgeX / fadeDistanceX, 2));

        // Use the tightest vertical margin so a bar hidden by either its top or bottom edge fades/hides correctly.
        const distToEdgeY = Math.min(worldMinY - bbox.min.y, bbox.max.y - worldMaxY);
        if (distToEdgeY <= 0)
            return 0;

        alpha = Math.min(alpha, Math.pow(distToEdgeY / fadeDistanceY, 2));

        return alpha;
    }

    /**
     * Layouts the bars in the series so that they are next to each other, with a small spacing between them.
     */
    public layoutBars(): void {
        const bbox = this.chart.getBBox();
        const chartWidth = bbox.max.x - bbox.min.x;
        const chartHeight = bbox.max.y - bbox.min.y;
        const centerY = (bbox.min.y + bbox.max.y) / 2;

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar = this.bars[barIdx];

            // X position: absolute world space from chart spacing parameters.
            bar.posX = (barIdx + 1) * (this.chart.barWidth + this.chart.barSpacing) * this.chart.zoom;

            if (chartHeight > 0 && centerY !== 0) {
                bar.posY = this.chart.getBBox().min.y + bar.o;
            } else {
                bar.posY = 0; // fallback to center when no price range available
            }

            // Scale values proportional to normalized chart dimensions for consistent rendering at any zoom level.
            if (chartHeight > 0) {
                // Width: fraction of visible X range → ~3% per bar with current defaults.
                bar._scaleWidth = this.chart.barWidth / chartWidth * this.chart.zoom;
                // Height: raw OHLC range as fraction of total chart height × visibility multiplier (5).
                bar._scaleBoxY = Math.max(bar.c - bar.o, 0.001) * this.chart.barScaleY;
                bar._scaleZ = this.chart.barWidth / chartWidth * this.chart.zoom;
            } else {
                bar._scaleWidth = 0.3;
                bar._scaleBoxY = 0.3;
                bar._scaleZ = 0.3;
            }
        }
    }

    /**
     * Updates all instance matrices and colors on the InstancedMesh.
     */
    private updateCubes(): void {
        if (!this.cubeMesh)
            return;

        const attributeOpacity = this.gfxCubeGeometry.getAttribute('opacity') as Gfx.InstancedBufferAttribute | null;

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar = this.bars[barIdx];

            const cubeHeight = Math.abs(bar.c - bar.o);

            bar.updateMatrix(this.chart.barWidth, cubeHeight);

            this.cubeMesh.setMatrixAt(barIdx, bar.getMatrix());

            this._tempColor.set(bar.displayColor.r, bar.displayColor.g, bar.displayColor.b);

            this.cubeMesh.setColorAt(barIdx, this._tempColor);

            const barMinY = Math.min(bar.posY, bar.posY + (bar.c - bar.o));
            const barMaxY = Math.max(bar.posY, bar.posY + (bar.c - bar.o));
            const alpha = this.computeEdgeFadeAlpha(bar.posX, barMinY, barMaxY);

            if (attributeOpacity)
                attributeOpacity.array[barIdx] = alpha;
        }

        this.cubeMesh.instanceMatrix.needsUpdate = true;

        if (this.cubeMesh.instanceColor)
            this.cubeMesh.instanceColor.needsUpdate = true;

        if (attributeOpacity)
            attributeOpacity.needsUpdate = true;

        this.cubeMesh.count = this.chart.numBarsVisible;
    }

    /**
     * Updates the shared LineSegments geometry with all bar wicks (high→low lines).
     * Uses normalized Y positions consistent with bar layout for proper alignment.
     */
    private updateLines(): void {
        if (!this.gfxLineMesh || !this.gfxLineGeometry)
            return;

        const positions = this.gfxLineGeometry.attributes.position.array as Float32Array;
        const colors    = this.gfxLineGeometry.attributes.color.array as Float32Array;
        const opacities = this.gfxLineGeometry.attributes.opacity.array as Float32Array | undefined;

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar  = this.bars[barIdx];
            const base = barIdx * 6;

            // Normalize high and low to the same coordinate system as bars.
            const hNorm = bar.h * this.chart.barScaleY;
            const lNorm = bar.l * this.chart.barScaleY;

            positions[base + 0] = bar.posX;     positions[base + 1] = hNorm; positions[base + 2] = 0;
            positions[base + 3] = bar.posX;     positions[base + 4] = lNorm; positions[base + 5] = 0;

            const barDisplayColor = bar.displayColor;

            const cBase = barIdx * 6;

            colors[cBase + 0] = barDisplayColor.r; colors[cBase + 1] = barDisplayColor.g; colors[cBase + 2] = barDisplayColor.b;
            colors[cBase + 3] = barDisplayColor.r; colors[cBase + 4] = barDisplayColor.g; colors[cBase + 5] = barDisplayColor.b;

            const lineMinY = Math.min(hNorm, lNorm);
            const lineMaxY = Math.max(hNorm, lNorm);
            const lineAlpha = this.computeEdgeFadeAlpha(bar.posX, lineMinY, lineMaxY);

            if (opacities) {
                // Opacity attribute has itemSize 1 (one value per vertex), unlike position/color's itemSize 3.
                opacities[barIdx * 2 + 0] = lineAlpha;
                opacities[barIdx * 2 + 1] = lineAlpha;
            }
        }

        this.gfxLineGeometry.attributes.position.needsUpdate = true;
        this.gfxLineGeometry.attributes.color.needsUpdate    = true;

        if (opacities)
            (this.gfxLineGeometry.attributes.opacity as Gfx.BufferAttribute).needsUpdate = true;

        this.gfxLineGeometry.setDrawRange(0, this.chart.numBarsVisible * 2);
    }

    /**
     * Randomizes the values of the bars in the series. This is useful for testing purposes.
     */
    public randomizeBars(): void {
        const date = new Date();

        for (let i = 0; i < this.numBarsAllocated; i++) {
            const bar = this.bars[i];
            const o = i > 0 ? this.bars[i - 1].c : Math.random() * 0.2;
            const h = o + Math.random() * 0.2;
            const l = o - Math.random() * 0.2;
            const c = l + Math.random() * (h - l);
            bar.setValues(date.getTime(), o, h, l, c);
            date.setTime(date.getTime() + 60 * 1000); // Increment by 1 minute for each bar.
        }
        
        this.updateGraphics();
    }

    /**
     * Updates the bars with new data or existing data. Will refresh the visual representation of the bars accordingly for the current window.
     *
     * @param data The new data to update the bars with.
     */
    public updateBars(data: TesterValuesColumns): void {
        this.setBarsCapacity(this.chart.numBarsVisible);

        // Always re-layout bars so Y positions and scales are normalized relative to current BBox.
        this.layoutBars();

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar = this.bars[barIdx];
            
            if (barIdx + this.chart.startIndex < data.values.length) {
                const row = data.values[barIdx + this.chart.startIndex];
                const ohlc = row.values;
                // `timestamp` is in Unix seconds; bars store milliseconds.
                const timeMs = Number(row.timestamp) * 1000;
                bar.setValues(timeMs, ohlc[0], ohlc[1], ohlc[2], ohlc[3]);
            } else {
                // If there's no data for this bar, set it to zero values.
                bar.setValues(0, 0, 0, 0, 0);
            }
        }
        
        this.updateGraphics();
    }

    /**
     * Gets the bar at the specified index.
     * 
     * @param index The index of the bar to get.
     * 
     * @returns The bar at the specified index, or undefined if the index is out of bounds.
     */
    public getBar(index: number): Bar | undefined {
        return this.bars[index];
    }

    /**
     * Updates cubes and lines colors.
     */
    public updateColors(): void {
        if (!this.cubeMesh)
            return;

        const attributeOpacity = this.gfxCubeGeometry.getAttribute('opacity') as Gfx.InstancedBufferAttribute | null;

        for (let barIndex = 0; barIndex < this.chart.numBarsVisible; barIndex++) {
            const bar = this.bars[barIndex];

            // Colorizing bar depending if it is bullish or bearish.
            bar.displayColor.r = bar.c >= bar.o ? 0 : 1;
            bar.displayColor.g = bar.c >= bar.o ? 1 : 0;
            bar.displayColor.b = 0;

            this._tempColor.set(bar.displayColor.r, bar.displayColor.g, bar.displayColor.b);

            this.cubeMesh.setColorAt(barIndex, this._tempColor);

            // Update the opacity attribute for this bar based on its fade state.
            if (attributeOpacity) {
                const barMinY = Math.min(bar.posY, bar.posY + (bar.c - bar.o));
                const barMaxY = Math.max(bar.posY, bar.posY + (bar.c - bar.o));
                attributeOpacity.array[barIndex] = this.computeEdgeFadeAlpha(bar.posX, barMinY, barMaxY);
            }
        }

        if (this.cubeMesh.instanceColor)
            this.cubeMesh.instanceColor.needsUpdate = true;

        if (attributeOpacity)
            attributeOpacity.needsUpdate = true;
    }

    /**
     * Recomputes only the per-instance/per-vertex fade opacity for cubes and lines, without
     * touching matrices or colors. Called every frame so fading stays in sync with scroll/zoom.
     */
    private updateFade(): void {
        const attributeOpacity = this.gfxCubeGeometry.getAttribute('opacity') as Gfx.InstancedBufferAttribute | null;
        const lineOpacities = this.gfxLineGeometry?.attributes.opacity.array as Float32Array | undefined;

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar = this.bars[barIdx];

            if (attributeOpacity) {
                const barMinY = Math.min(bar.posY, bar.posY + (bar.c - bar.o));
                const barMaxY = Math.max(bar.posY, bar.posY + (bar.c - bar.o));
                attributeOpacity.array[barIdx] = this.computeEdgeFadeAlpha(bar.posX, barMinY, barMaxY);
            }

            if (lineOpacities) {
                const hNorm = bar.h * this.chart.barScaleY;
                const lNorm = bar.l * this.chart.barScaleY;
                const lineMinY = Math.min(hNorm, lNorm);
                const lineMaxY = Math.max(hNorm, lNorm);
                const lineAlpha = this.computeEdgeFadeAlpha(bar.posX, lineMinY, lineMaxY);

                // Opacity attribute has itemSize 1 (one value per vertex), unlike position/color's itemSize 3.
                lineOpacities[barIdx * 2 + 0] = lineAlpha;
                lineOpacities[barIdx * 2 + 1] = lineAlpha;
            }
        }

        if (attributeOpacity)
            attributeOpacity.needsUpdate = true;

        if (lineOpacities)
            (this.gfxLineGeometry!.attributes.opacity as Gfx.BufferAttribute).needsUpdate = true;
    }

    /**
     * Updates instance matrices on the InstancedMesh only (no color changes).
     * Used internally by picking to ensure geometry is up-to-date before raycasting.
     */
    public updateMatricesOnly(): void {
        if (!this.cubeMesh) return;

        const count = this.chart.numBarsVisible;
        for (let i = 0; i < count; i++) {
            const bar = this.bars[i];
            const boxHeight = Math.abs(bar.c - bar.o);
            bar.updateMatrix(this.chart.barWidth, boxHeight);
            this.cubeMesh.setMatrixAt(i, bar.getMatrix());
        }

        this.cubeMesh.instanceMatrix.needsUpdate = true;
        this.cubeMesh.count = count;
    }

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);

        if (Renderer.frameId === this.lastUpdatedFrameId)
            return;

        this.lastUpdatedFrameId = Renderer.frameId;

        this.updateFade();
    }
}