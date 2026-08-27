import * as Gfx from 'three';
import { Bar } from './Bar';
import { type TesterValuesColumns } from 'fx31337-wasm/lib/types/TesterValuesColumns';
import { Chart } from './Chart';

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

    /** Number of currently active (visible) bars — always ≤ bars.length. */
    private _activeBarCount: number = 0;

    /** Returns the number of active bars in this series. */
    public getNumBars(): number {
        return this._activeBarCount;
    }
    /** Shared unit-cube geometry for InstancedMesh. */
    private _boxGeometry = new Gfx.BoxGeometry(1, 1, 1);

    /** Single InstancedMesh that renders all bar boxes. */
    private _instancedMesh: Gfx.InstancedMesh | null = null;

    /** Shared material for the instanced bars — transparent so edge-fade uses alpha. */
    private _boxMaterial = Series._makeBoxMaterial();

    /** Per-instance opacity values written to the 'instanceOpacity' geometry attribute. */
    private _instanceOpacityArr: Float32Array | null = null;

    /** BufferGeometry holding all vertical lines as LineSegments pairs. */
    private _lineGeometry: Gfx.BufferGeometry | null = null;

    /** Single LineSegments that renders all bar wicks. */
    private _lineMesh: Gfx.LineSegments | null = null;

    /** Material for the line mesh (tracked for proper disposal). */
    private _lineMaterial: Gfx.LineBasicMaterial | null = null;

    /** Per-vertex (2 per bar) opacity values written to the 'aOpacity' geometry attribute. */
    private _lineOpacityArr: Float32Array | null = null;

    /** Temporary color reused when setting instance colors. */
    private _tempColor = new Gfx.Color();

    /** Number of bar-widths at each edge over which bars fade in/out. */
    private static readonly FADE_BARS = 3;

    /** The current bar width (used for scale). */
    private _barWidth: number = 0.1;

    /** The current bar spacing (used for layout). */
    private _barSpacing: number = 0.05;

    /** Allocated GPU buffer capacity in number of bars — only grows, never shrinks on zoom. */
    private _allocatedCapacityMesh: number = 0;

    /** Allocated GPU buffer capacity in number of lines — only grows, never shrinks on zoom. */
    private _allocatedCapacityLines: number = 0;

    /** The data for this series, stored as an array of TesterValuesColumns. */
    private _data: TesterValuesColumns[] = [];

    /**
     * Gets the current data set for this series.
     */
    public getData(): TesterValuesColumns[] {
        return this._data;
    }

    /** Constructor. */
    public constructor() {
        super();
    }

    /** Creates the shared box material with per-instance alpha support via shader injection. */
    private static _makeBoxMaterial(): Gfx.MeshLambertMaterial {
        const mat = new Gfx.MeshLambertMaterial({ transparent: true });
        mat.onBeforeCompile = (shader) => {
            shader.vertexShader =
                'attribute float instanceOpacity;\nvarying float vInstanceOpacity;\n' +
                shader.vertexShader.replace(
                    'void main() {',
                    'void main() {\n\tvInstanceOpacity = instanceOpacity;'
                );
            shader.fragmentShader =
                'varying float vInstanceOpacity;\n' +
                shader.fragmentShader.replace(
                    '#include <premultiplied_alpha_fragment>',
                    'gl_FragColor.a *= vInstanceOpacity;\n#include <premultiplied_alpha_fragment>'
                );
        };
        return mat;
    }

    /** Creates a line material with per-vertex alpha support via shader injection. */
    private static _makeLineMaterial(): Gfx.LineBasicMaterial {
        const mat = new Gfx.LineBasicMaterial({ vertexColors: true, transparent: true });
        mat.onBeforeCompile = (shader) => {
            shader.vertexShader =
                'attribute float aOpacity;\nvarying float vOpacity;\n' +
                shader.vertexShader.replace(
                    'void main() {',
                    'void main() {\n\tvOpacity = aOpacity;'
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
        this._data = data;

        this.updateGraphics();
    }

    /**
     * Sets the number of bars displayed at one for the series.
     * 
     * @param numBars The number of bars to set.
     * @param barWidth The width of each bar.
     * @param barSpacing The spacing between bars.
     */
    public setNumBarsDisplayed(numBars: number, barWidth: number, barSpacing: number): void {
        if (numBars < 0)
            throw new Error('Number of bars cannot be negative.');

        // Use Math.ceil to ensure the target is an integer so that the bar array length
        // and allocated capacity are always in sync.
        const numBarsInt = Math.ceil(numBars);

        this._barWidth = this.parent instanceof Chart ? barWidth * (this.parent as Chart)._zoom : barWidth;
        this._barSpacing = this.parent instanceof Chart ? barSpacing * (this.parent as Chart)._zoom : barSpacing;

        // Grow the bar pool only when we need more bars than ever before.
        // Existing Bar objects are reused on zoom-out — no allocation needed.
        while (this.bars.length < numBarsInt) {
            const previousBar = this.bars.length > 0 ? this.bars[this.bars.length - 1] : null;
            this.bars.push(new Bar(previousBar));
        }

        // Activate exactly numBarsInt bars — no objects created or destroyed.
        this._activeBarCount = numBarsInt;

        // Sets InstancedMesh and LineSegments capacity.
        this._setCapacity(numBarsInt);

        this.updateGraphics();
    }

    /**
     * Updates the graphics for the series, including layout, instance matrices, and line geometry.
     */
    public updateGraphics(): void {
        // Layout bars in the x-axis.
        this.layoutBars(this._barWidth, this._barSpacing);

        // Update all instance matrices and colors.
        this.updateInstances();

        // Update line geometry for all bars.
        this.updateLines();
    }

    /**
     * Ensures the InstancedMesh capacity is at least `count`. Only reallocates when the
     * requested count exceeds the current GPU buffer size. Otherwise reuses the existing
     * buffer and adjusts the draw count via `InstancedMesh.count`.
     */
    private _setInstancedMeshCapacity(count: number): void {
        if (this._instancedMesh === null) {
            this._instancedMesh = new Gfx.InstancedMesh(this._boxGeometry, this._boxMaterial, count);
            this._instancedMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);
            this.add(this._instancedMesh);
        } else if (count > this._allocatedCapacityMesh) {
            const oldMesh = this._instancedMesh;
            const copyCount = this._allocatedCapacityMesh;

            this._instancedMesh = new Gfx.InstancedMesh(this._boxGeometry, this._boxMaterial, count);
            this._instancedMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);

            const targetMatrix = new Gfx.Matrix4();
            for (let i = 0; i < copyCount; i++) {
                oldMesh.getMatrixAt(i, targetMatrix);
                this._instancedMesh.setMatrixAt(i, targetMatrix);
                if (oldMesh.instanceColor && this._instancedMesh.instanceColor) {
                    oldMesh.getColorAt(i, this._tempColor);
                    this._instancedMesh.setColorAt(i, this._tempColor);
                }
            }

            this._instancedMesh.instanceMatrix.needsUpdate = true;
            if (this._instancedMesh.instanceColor)
                this._instancedMesh.instanceColor.needsUpdate = true;

            oldMesh.parent?.remove(oldMesh);
            this.add(this._instancedMesh);

            this._allocatedCapacityMesh = count;
        }

        // Ensure per-instance opacity attribute is large enough and attached to the geometry.
        if (!this._instanceOpacityArr || this._instanceOpacityArr.length < count) {
            this._instanceOpacityArr = new Float32Array(count).fill(1);
            this._boxGeometry.setAttribute(
                'instanceOpacity',
                new Gfx.InstancedBufferAttribute(this._instanceOpacityArr, 1)
            );
        }

        this._instancedMesh.count = count;
    }

    /**
     * Ensures the LineSegments buffer capacity is at least `count`. Only reallocates when the
     * requested count exceeds the current GPU buffer size. Otherwise reuses the existing
     * buffer and adjusts the draw range via `setDrawRange`.
     */
    private _setLineSegmentsCapacity(count: number): void {
        if (this._lineMesh === null || count > this._allocatedCapacityLines) {
            // Dispose old material and geometry.
            if (this._lineMaterial) {
                this._lineMaterial.dispose();
                this._lineMaterial = null;
            } 
            if (this._lineGeometry) {
                this._lineGeometry.dispose();
                this._lineGeometry = null;
            }
            if (this._lineMesh) {
                this.remove(this._lineMesh);
                this._lineMesh = null;
            }

            // Create new geometry and buffers sized to the new capacity.
            this._lineGeometry = new Gfx.BufferGeometry();
            const posAttr = new Gfx.BufferAttribute(new Float32Array(count * 6), 3);
            const colAttr = new Gfx.BufferAttribute(new Float32Array(count * 6), 3);
            this._lineOpacityArr = new Float32Array(count * 2).fill(1);
            this._lineGeometry.setAttribute('position', posAttr);
            this._lineGeometry.setAttribute('color', colAttr);
            this._lineGeometry.setAttribute('aOpacity', new Gfx.BufferAttribute(this._lineOpacityArr, 1));

            this._lineMaterial = Series._makeLineMaterial();
            this._lineMesh = new Gfx.LineSegments(this._lineGeometry, this._lineMaterial);
            this.add(this._lineMesh);

            this._allocatedCapacityLines = count;
        }
        // Always update the draw range to exactly the requested count — no reallocation needed.
        this._lineGeometry!.setDrawRange(0, count * 2);

   }

    /**
     * Ensures InstancedMesh and LineSegments buffers can hold at least `count` bars.
     * Buffers only grow — they are never shrunk on zoom. The visible draw count is
     * adjusted via `InstancedMesh.count` / `setDrawRange` to avoid GPU reallocations.
     */
    private _setCapacity(count: number): void {
        this._setInstancedMeshCapacity(count);
        this._setLineSegmentsCapacity(count);
    }

    /**
     * Gets the matrix for a given instance index (from either old or new InstancedMesh).
     */
    private _getMatrixAt(index: number): Gfx.Matrix4 {
        // After replacement, data is already in this._instancedMesh.
        // This helper exists for the resize path; during normal updates we write directly.
        const m = new Gfx.Matrix4();
        this._instancedMesh!.getMatrixAt(index, m);
        return m;
    }

    /**
     * Gets the color for a given instance index.
     */
    private _getColorAt(index: number): Gfx.Color {
        const c = new Gfx.Color();
        this._instancedMesh!.getColorAt(index, c);
        return c;
    }

    /**
     * Layouts the bars in the series so that they are next to each other, with a small spacing between them.
     * 
     * @param barWidth The width of each bar.
     * @param spacing The spacing between bars.
     */
    public layoutBars(barWidth: number = 0.1, spacing: number = 0.1): void {
        for (let i = 0; i < this._activeBarCount; i++) {
            const bar = this.bars[i];
            bar.posX = (i + 1) * (barWidth + spacing);
        }
    }

    /**
     * Returns a [0..1] fade factor for a bar at the given series-local x,
     * fading to 0 near the chart's left and right edges.
     */
    private _edgeFade(barLocalX: number): number {
        const chart = this.parent instanceof Chart ? this.parent as Chart : null;
        if (!chart) return 1;
        const unzoomedStep = chart.barWidth + chart.barSpacing;
        const halfW       = chart.numBars * unzoomedStep / 2;
        const fadeZone    = (this._barWidth + this._barSpacing) * Series.FADE_BARS;
        const barWorldX   = this.position.x + barLocalX;
        const leftFade    = Math.max(0, Math.min(1, (barWorldX - (-halfW)) / fadeZone));
        const rightFade   = Math.max(0, Math.min(1, (halfW  - barWorldX)  / fadeZone));
        return Math.min(leftFade, rightFade);
    }

    /**
     * Updates all instance matrices and colors on the InstancedMesh.
     */
    private updateInstances(): void {
        if (!this._instancedMesh)
            return;

        const count = this._activeBarCount;
        const opacityAttr = this._boxGeometry.getAttribute('instanceOpacity') as Gfx.InstancedBufferAttribute | null;

        for (let i = 0; i < count; i++) {
            const bar = this.bars[i];
            const boxHeight = Math.abs(bar.c - bar.o);
            bar.updateMatrix(this._barWidth, boxHeight);
            this._instancedMesh.setMatrixAt(i, bar.getMatrix());

            const dc = bar.displayColor;
            this._tempColor.set(dc.r, dc.g, dc.b);
            this._instancedMesh.setColorAt(i, this._tempColor);

            if (opacityAttr) opacityAttr.array[i] = this._edgeFade(bar.posX);
        }

        this._instancedMesh.instanceMatrix.needsUpdate = true;
        if (this._instancedMesh.instanceColor)
            this._instancedMesh.instanceColor.needsUpdate = true;
        if (opacityAttr) opacityAttr.needsUpdate = true;

        this._instancedMesh.count = count;
    }

    /**
     * Updates the shared LineSegments geometry with all bar wicks (high→low lines).
     */
    private updateLines(): void {
        if (!this._lineMesh || !this._lineGeometry)
            return;

        const positions = this._lineGeometry.attributes.position.array as Float32Array;
        const colors    = this._lineGeometry.attributes.color.array as Float32Array;
        const opacities = this._lineGeometry.attributes.aOpacity?.array as Float32Array | undefined;
        const count = this._activeBarCount;

        for (let i = 0; i < count; i++) {
            const bar  = this.bars[i];
            const base = i * 6;
            positions[base + 0] = bar.posX; positions[base + 1] = bar.h; positions[base + 2] = 0;
            positions[base + 3] = bar.posX; positions[base + 4] = bar.l; positions[base + 5] = 0;

            const dc    = bar.displayColor;
            const cBase = i * 6;
            colors[cBase + 0] = dc.r; colors[cBase + 1] = dc.g; colors[cBase + 2] = dc.b;
            colors[cBase + 3] = dc.r; colors[cBase + 4] = dc.g; colors[cBase + 5] = dc.b;

            if (opacities) {
                const fade = this._edgeFade(bar.posX);
                opacities[i * 2]     = fade;
                opacities[i * 2 + 1] = fade;
            }
        }

        this._lineGeometry.attributes.position.needsUpdate = true;
        this._lineGeometry.attributes.color.needsUpdate    = true;
        if (opacities) (this._lineGeometry.attributes.aOpacity as Gfx.BufferAttribute).needsUpdate = true;

        this._lineGeometry.setDrawRange(0, count * 2);
    }

    /**
     * Randomizes the values of the bars in the series. This is useful for testing purposes.
     */
    public randomizeBars(): void {
        const date = new Date();

        for (let i = 0; i < this._activeBarCount; i++) {
            const bar = this.bars[i];
            const o = i > 0 ? this.bars[i - 1].c : Math.random() * 0.2;
            const h = o + Math.random() * 0.2;
            const l = o - Math.random() * 0.2;
            const c = l + Math.random() * (h - l);
            bar.setValues(date.getTime(), o, h, l, c);
            date.setTime(date.getTime() + 60 * 1000); // Increment by 1 minute for each bar.
        }
        // After randomizing, push updates to GPU.
        this.updateInstances();
        this.updateLines();
    }

    public updateBarsFromData(data: TesterValuesColumns, startIndex: number = 0): void {
        const date = new Date();

        for (let i = 0; i < this._activeBarCount; i++) {
            const bar = this.bars[i];
            if (i + startIndex < data.values.length) {
                const row = data.values[i + startIndex];
                const ohlc = row.values;
                bar.setValues(date.getTime(), ohlc[0], ohlc[1], ohlc[2], ohlc[3]);
            } else {
                // If there's no data for this bar, set it to zero values.
                bar.setValues(date.getTime(), 0, 0, 0, 0);
            }
            date.setTime(date.getTime() + 60 * 1000); // Increment by 1 minute for each bar.
        }
        // After updating from data, push updates to GPU.
        this.updateInstances();
        this.updateLines();
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
     * Updates only the instance colors on the InstancedMesh (not matrices).
     * Call this after selection/hover state changes to refresh bar colors.
     */
    public updateColors(): void {
        if (!this._instancedMesh) return;

        const count = this._activeBarCount;
        const opacityAttr = this._boxGeometry.getAttribute('instanceOpacity') as Gfx.InstancedBufferAttribute | null;

        for (let i = 0; i < count; i++) {
            const bar = this.bars[i];
            const dc = bar.displayColor;
            this._tempColor.set(dc.r, dc.g, dc.b);
            this._instancedMesh.setColorAt(i, this._tempColor);
            if (opacityAttr) opacityAttr.array[i] = this._edgeFade(bar.posX);
        }

        if (this._instancedMesh.instanceColor)
            this._instancedMesh.instanceColor.needsUpdate = true;
        if (opacityAttr) opacityAttr.needsUpdate = true;

        // Also update line colors.
        this.updateLines();
    }

    /**
     * Updates instance matrices on the InstancedMesh only (no color changes).
     * Used internally by picking to ensure geometry is up-to-date before raycasting.
     */
    public updateMatricesOnly(): void {
        if (!this._instancedMesh) return;

        const count = this._activeBarCount;
        for (let i = 0; i < count; i++) {
            const bar = this.bars[i];
            const boxHeight = Math.abs(bar.c - bar.o);
            bar.updateMatrix(this._barWidth, boxHeight);
            this._instancedMesh.setMatrixAt(i, bar.getMatrix());
        }

        this._instancedMesh.instanceMatrix.needsUpdate = true;
        this._instancedMesh.count = count;
    }

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);
    }
}