import * as Gfx from 'three';
import { Bar } from './Bar';
import { type TesterValuesColumns } from 'fx31337-wasm/lib/types/TesterValuesColumns';
import { Chart } from './Chart';
import { Renderer } from './../Renderer';

export enum SeriesType {
    Candlestick,
    Line,
    LineSmoothed
}

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
     * The type of this series (Candlestick, Line, or LineSmoothed).
     */
    public seriesType: SeriesType = SeriesType.Candlestick;

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

    /** Invisible, enlarged instances used only for cube-bar raycasting. */
    private cubePickMesh: Gfx.InstancedMesh | null = null;

    /** Shared material for the instanced bars — transparent so edge-fade uses alpha. */
    private gfxMaterialCube = Series.createCubeMaterial();

    private gfxMaterialPick = new Gfx.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        side: Gfx.DoubleSide,
    });

    /** BufferGeometry holding all vertical lines as LineSegments pairs. */
    private gfxLineGeometry: Gfx.BufferGeometry | null = null;

    /** Single LineSegments that renders all bar wicks. */
    private gfxLineMesh: Gfx.LineSegments | null = null;

    /** Material for the line mesh (tracked for proper disposal). */
    private gfxMaterialLine: Gfx.LineBasicMaterial | null = null;

    /** Instanced circles marking each line-series bar/value point. */
    private valuePointMesh: Gfx.InstancedMesh | null = null;

    /** Invisible, wider instances used only for line-point raycasting. */
    private valuePointPickMesh: Gfx.InstancedMesh | null = null;

    private valuePointGeometry: Gfx.CircleGeometry = new Gfx.CircleGeometry(1, 12);

    private valuePointPickGeometry: Gfx.CircleGeometry = new Gfx.CircleGeometry(1, 12);

    private valuePointMaterial: Gfx.MeshBasicMaterial = new Gfx.MeshBasicMaterial({ color: 0xffffff, depthTest: false });

    private valuePointPickMaterial: Gfx.MeshBasicMaterial = new Gfx.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        side: Gfx.DoubleSide,
    });

    private numAllocatedValuePoints: number = 0;

    private _tempMatrix = new Gfx.Matrix4();

    private _tempPosition = new Gfx.Vector3();

    private _tempQuaternion = new Gfx.Quaternion();

    private _tempScale = new Gfx.Vector3();

    /** Temporary color reused when setting instance colors. */
    private _tempColor = new Gfx.Color();

    /** Allocated GPU buffer capacity in number of bars — only grows, never shrinks on zoom. */
    private numAllocatedCubes: number = 0;

    private static readonly CUBE_PICK_SCALE = 3;

    /**
     * Depth of the bar boxes. The chart is flat (2D), so this is only large enough to keep the
     * box geometry from degenerating into zero-area faces.
     */
    private static readonly FLAT_DEPTH = 0.0001;

    private static readonly VALUE_POINT_PICK_RADIUS_MULTIPLIER = 4;

    /**
     * Radius factor (relative to the bar pitch) of the marker drawn on a hovered value point.
     * Kept a little larger than the plain point radius so the hovered points stand out.
     */
    private static readonly HOVER_POINT_RADIUS_FACTOR = 0.22;

    /** Allocated GPU buffer capacity in number of lines — only grows, never shrinks on zoom. */
    private numAllocatedLines: number = 0;

    /** The chart width and height used during the last layout pass (for line rendering). */
    public _chartWidth: number = 1;
    public _chartHeight: number = 1;

    /** The data for this series, stored as an array of TesterValuesColumns. */
    public data: TesterValuesColumns | null = null;

    /**
     * Whether this series is drawn on the chart. Hiding a series keeps its data intact, so it can
     * be shown again without re-running the indicator.
     */
    public visible: boolean = true;

    /**
     * Whether this series holds price values (as opposed to e.g. a 0..100 oscillator). Price series
     * are mapped onto the chart's price window and follow the vertical scroll; non-price series are
     * mapped onto a fixed 0..100 range and keep a static vertical position.
     */
    public get isPriceSeries(): boolean {
        return Chart.isPriceValueRange(this.data?.indicator_info?.value_range);
    }

    /**
     * Converts a raw indicator value of this series into a world-space Y coordinate inside the chart.
     */
    public valueToWorldY(value: number): number {
        return this.isPriceSeries
            ? this.chart.priceToWorldY(value)
            : this.chart.valueToWorldY(value);
    }

    /**
     * Returns the values of the most recent bar of this series, or an empty array when there is
     * no data. For OHLC series the last element is the close price.
     */
    public get lastValues(): number[] {
        const values = this.data?.values;

        if (!values || values.length === 0)
            return [];

        return Chart.entryValues(values[values.length - 1]);
    }

    /**
     * World units per raw indicator value. Price series are mapped onto the chart's price window,
     * non-price series onto a fixed 0..100 range.
     */
    public get unitsPerValue(): number {
        const chartHeight = this.chart.chartHeight;

        if (!this.isPriceSeries)
            return chartHeight / 100;

        const priceRange = this.chart.priceMax - this.chart.priceMin;

        return priceRange > 0 ? chartHeight / priceRange : 0;
    }

    /**
     * Index of this series within the chart.
     */
    private _index: number = 0;

    /** Predefined colors cycled through for each value channel when seriesType is Line/LineSmoothed. */
    private static readonly LINE_SERIES_COLORS: number[] = [
        0x2196f3, 0xff9800, 0x4caf50, 0xe91e63,
        0x9c27b0, 0x00bcd4, 0xffc107, 0x795548,
    ];

    /** Cached Gfx.Color instances for LINE_SERIES_COLORS, built once. */
    private static readonly lineColorCache: Gfx.Color[] = Series.LINE_SERIES_COLORS.map(c => new Gfx.Color(c));

    /**
     * Explicit color (0xRRGGBB) assigned to this series, or null to derive it from the index.
     *
     * An explicit color keeps an indicator's color stable when the indicator list is reordered.
     */
    private _colorOverride: number | null = null;

    /**
     * Sets an explicit color for this series, or clears it when null is given.
     */
    public setColorOverride(color: number | null): void {
        this._colorOverride = color;
    }

    /**
     * Parses a `#rrggbb` (or `#rgb`) string into a 0xRRGGBB number, or null when invalid.
     */
    public static parseColor(color: string | undefined | null): number | null {
        if (!color)
            return null;

        const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());

        if (!match)
            return null;

        let hex = match[1];

        if (hex.length === 3)
            hex = hex.split('').map(c => c + c).join('');

        return parseInt(hex, 16);
    }

    /**
     * Formats a 0xRRGGBB number as a `#rrggbb` string.
     */
    public static formatColor(color: number): string {
        return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
    }

    /** Returns the predefined color for a given value channel index, cycling through the palette. */
    private static getLineColor(valueIndex: number): Gfx.Color {
        return Series.lineColorCache[valueIndex % Series.lineColorCache.length];
    }

    /**
     * Returns the color (0xRRGGBB) used to draw the first value channel of the series at the given
     * index. This is the color the series is actually rendered with, so UI can show a matching
     * swatch.
     */
    public static getSeriesColor(index: number): number {
        const colors = Series.LINE_SERIES_COLORS;

        return colors[((index % colors.length) + colors.length) % colors.length];
    }

    /**
     * The color (0xRRGGBB) this series is drawn with on the chart.
     */
    public get color(): number {
        return this._colorOverride ?? Series.getSeriesColor(this._index);
    }

    /**
     * Returns the color for the given value channel of this series.
     *
     * The first channel uses the series color (which may be an explicit override); further
     * channels continue through the palette from there.
     */
    private getValueChannelColor(valueIndex: number): Gfx.Color {
        if (this._colorOverride === null)
            return Series.getLineColor(valueIndex + this._index);

        if (valueIndex === 0)
            return this._tempChannelColor.set(this._colorOverride);

        // Continue through the palette, starting after the overridden color's palette slot.
        const baseIndex = Series.LINE_SERIES_COLORS.indexOf(this._colorOverride);

        return Series.getLineColor(valueIndex + (baseIndex >= 0 ? baseIndex : this._index));
    }

    /** Scratch color reused by getValueChannelColor(). */
    private _tempChannelColor: Gfx.Color = new Gfx.Color();

    /** Index of the bar column currently hovered for Line-type series, or -1 if none. */
    private hoveredBarIndex: number = -1;

    /**
     * Index of the value channel hovered exactly, or -1 when the whole column is hovered.
     *
     * A negative index means "every channel of `hoveredBarIndex`", which is what makes a single
     * hover mark all indicators from top to bottom instead of only the one nearest the cursor.
     */
    private hoveredValueIndex: number = -1;

    private selectedValueBarIndex: number = -1;

    private selectedValueIndex: number = -1;

    private selectedPointMesh: Gfx.Mesh | null = null;

    private selectedPointMaterial: Gfx.MeshBasicMaterial | null = null;

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
    public setData(data: TesterValuesColumns | null): void {
        this.data = data;

        if (data && data.values.length > 0) {
            const firstEntry = data.values[0] as unknown as { values: { length: number } };
            this.seriesType = firstEntry.values.length === 4 ? SeriesType.Candlestick : SeriesType.Line;
        }

        this.updateGraphics();
    }

    /**
     * Sets the index of this series within the chart. This is used for layout and rendering purposes.
     * 
     * @param index The index of the series within the chart.
     */
    public setIndex(index: number): void {
        this._index = index;
    }

    /**
     * Stops drawing this series without discarding its data.
     *
     * The draw counts are zeroed rather than toggling `Object3D.visible`, because the pick meshes
     * are already hidden and rely on their own counts for raycasting.
     */
    private hideGraphics(): void {
        if (this.cubeMesh)
            this.cubeMesh.count = 0;

        if (this.cubePickMesh)
            this.cubePickMesh.count = 0;

        if (this.gfxLineGeometry)
            this.gfxLineGeometry.setDrawRange(0, 0);

        if (this.valuePointMesh)
            this.valuePointMesh.count = 0;

        if (this.valuePointPickMesh)
            this.valuePointPickMesh.count = 0;

        if (this.selectedPointMesh)
            this.selectedPointMesh.visible = false;
    }

    /**
     * Updates the graphics for the series, including layout, instance matrices, and line geometry.
     */
    public updateGraphics(): void {
        // A hidden series keeps its data but draws nothing.
        if (!this.visible) {
            this.hideGraphics();
            return;
        }

        // Ensures that instanced meshes for cubes and lines have sufficient capacity.
        this.setBarsCapacity(this.chart.numBarsVisible);

        this.updateBars();

        // Ensures the shared line buffer has enough capacity for the current series type (only grows).
        // Must run after updateBars() so bar.values reflects the current data window.
        this.setLinesCapacity(this.computeNeededLineSegments());
        this.setValuePointsCapacity(this.seriesType === SeriesType.Candlestick
            ? 0
            : this.getNumValueChannels() * this.chart.numBarsVisible);

        // Layout bars cubes.
        this.layoutBars();

        this.updateColors();

        if (this.seriesType === SeriesType.Candlestick) {
            // Update lines (wicks) and cube instances for bars.
            this.updateLines();
            this.updateCubes();
        } else {
            // Draw connected polylines (one per value channel) instead of cubes/wicks.
            this.updateValueLines();

            if (this.cubeMesh)
                this.cubeMesh.count = 0;
        }

        this.updateSelectedPoint();
    }

    /**
     * Returns the number of value channels present in the bar data (e.g. 4 for OHLC, or the width
     * of indicator data for Line-type series). Returns 0 if no bar currently holds data.
     */
    private getNumValueChannels(): number {
        for (const bar of this.bars) {
            if (bar.values.length > 0)
                return bar.values.length;
        }

        return 0;
    }

    /**
     * Computes how many line segments are needed in the shared LineSegments buffer for the
     * current series type: one wick per bar for Candlestick, or one segment per consecutive
     * bar pair per value channel for Line/LineSmoothed.
     */
    private computeNeededLineSegments(): number {
        if (this.seriesType === SeriesType.Candlestick)
            return this.chart.numBarsVisible;

        const numValues = this.getNumValueChannels();
        const numBars = this.chart.numBarsVisible;

        return numValues > 0 && numBars > 1 ? numValues * (numBars - 1) : 0;
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

            this.cubePickMesh = new Gfx.InstancedMesh(this.gfxCubeGeometry, this.gfxMaterialPick, count);
            this.cubePickMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);
            this.cubePickMesh.visible = false;
            this.add(this.cubePickMesh);
        }
        
        if (count > this.numAllocatedCubes) {
            // Allocate a new InstancedMesh with the increased capacity and copy existing instance data.
            const oldMesh = this.cubeMesh;
            const oldPickMesh = this.cubePickMesh;
            const oldNumAllocatedCubes = this.numAllocatedCubes;

            this.cubeMesh = new Gfx.InstancedMesh(this.gfxCubeGeometry, this.gfxMaterialCube, count);
            this.cubePickMesh = new Gfx.InstancedMesh(this.gfxCubeGeometry, this.gfxMaterialPick, count);

            // Setting the usage of the instance matrix to dynamic draw for efficient updates.
            this.cubeMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);
            this.cubePickMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);
            this.cubePickMesh.visible = false;

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
            oldPickMesh?.parent?.remove(oldPickMesh);

            this.add(this.cubeMesh);
            this.add(this.cubePickMesh);

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
        this.gfxLineGeometry!.setDrawRange(0, this.data ? count * 2 : 0);
    }

    /** Ensures the instanced marker buffer can hold every visible line-series value point. */
    private setValuePointsCapacity(count: number): void {
        if (count <= 0) {
            if (this.valuePointMesh)
                this.valuePointMesh.count = 0;
            if (this.valuePointPickMesh)
                this.valuePointPickMesh.count = 0;
            return;
        }

        if (this.valuePointMesh && this.valuePointPickMesh && count <= this.numAllocatedValuePoints)
            return;

        const oldMesh = this.valuePointMesh;
        const oldPickMesh = this.valuePointPickMesh;
        this.valuePointMesh = new Gfx.InstancedMesh(this.valuePointGeometry, this.valuePointMaterial, count);
        this.valuePointMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);
        this.valuePointMesh.renderOrder = 2;
        this.valuePointPickMesh = new Gfx.InstancedMesh(this.valuePointPickGeometry, this.valuePointPickMaterial, count);
        this.valuePointPickMesh.instanceMatrix.setUsage(Gfx.DynamicDrawUsage);
        this.valuePointPickMesh.visible = false;

        if (oldMesh)
            this.remove(oldMesh);
        if (oldPickMesh)
            this.remove(oldPickMesh);

        this.add(this.valuePointMesh);
        this.add(this.valuePointPickMesh);
        this.numAllocatedValuePoints = count;
    }

    public resolvePickTarget(mesh: Gfx.InstancedMesh, instanceId: number):
        { kind: 'bar'; barIndex: number } | { kind: 'point'; barIndex: number; valueIndex: number } | null {
        if (instanceId < 0)
            return null;

        if (mesh === this.valuePointPickMesh) {
            const numBars = this.chart.numBarsVisible;
            if (numBars === 0 || instanceId >= mesh.count)
                return null;

            const valueIndex = Math.floor(instanceId / numBars);
            const barIndex = instanceId % numBars;

            // Gap slots have a degenerate pick matrix that raycasting can still report; ignore them.
            if (this.bars[barIndex]?.values[valueIndex] === undefined)
                return null;

            return { kind: 'point', barIndex, valueIndex };
        }

        if (mesh === this.cubePickMesh && instanceId < this.chart.numBarsVisible) {
            // Line series keep an (invisible) cube per bar; only candlesticks with data are hoverable.
            if (this.seriesType !== SeriesType.Candlestick || this.bars[instanceId]?.values.length === 0)
                return null;

            return { kind: 'bar', barIndex: instanceId };
        }

        return null;
    }

    public addPickableMeshes(target: Gfx.Object3D[]): void {
        if (this.cubePickMesh && this.cubePickMesh.count > 0)
            target.push(this.cubePickMesh);
        if (this.valuePointMesh && this.valuePointMesh.count > 0)
            target.push(this.valuePointPickMesh!);
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
        // Unzoomed reference width: the bbox width follows numBarsVisible (zoom), which would make
        // bars shrink whenever the bbox is recomputed while zoomed out (e.g. on setData()).
        const chartWidth = this.chart.numInitialBars * (this.chart.barWidth + this.chart.barSpacing);

        // World units per raw indicator value. Price series are mapped onto the chart's price
        // window, non-price series onto a fixed 0..100 range.
        const unitsPerValue = this.unitsPerValue;

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar = this.bars[barIdx];

            // X position: absolute world space from chart spacing parameters.
            bar.posX = (barIdx + 1) * (this.chart.barWidth + this.chart.barSpacing) * this.chart.zoom;

            // The cube is centred on posY, so a candle body is centred between open and close.
            if (bar.values.length === 4)
                bar.posY = this.valueToWorldY((bar.values[0] + bar.values[3]) / 2);
            else if (bar.values.length > 0)
                bar.posY = this.valueToWorldY(bar.values[0]);
            else
                bar.posY = 0;

            bar.posZ = 0;

            // Scale values proportional to normalized chart dimensions for consistent rendering at any zoom level.
            if (chartWidth > 0) {
                // Width: fraction of visible X range → ~3% per bar with current defaults.
                bar._scaleWidth = this.chart.barWidth / chartWidth * this.chart.zoom;

                // Height: the OHLC body height converted into world units.
                if (bar.values.length === 4)
                    bar._scaleBoxY = Math.max(Math.abs(bar.values[3] - bar.values[0]) * unitsPerValue, 0.0001);
                else
                    bar._scaleBoxY = 0.0001;

                // The chart is flat (2D), so bars are effectively flat quads. A tiny non-zero
                // depth keeps the box geometry from degenerating (which would z-fight).
                bar._scaleZ = Series.FLAT_DEPTH;
            } else {
                bar._scaleWidth = 0.3;
                bar._scaleBoxY = 0.3;
                bar._scaleZ = Series.FLAT_DEPTH;
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


            let cubeHeight;
            
            if (bar.values.length === 4)
                cubeHeight = Math.abs(bar.values[3] - bar.values[0]) * this.unitsPerValue;
            else
                cubeHeight = 0.001;

            bar.updateMatrix(this.chart.barWidth, cubeHeight);

            this.cubeMesh.setMatrixAt(barIdx, bar.getMatrix());
            this.updateCubePickMatrix(barIdx, bar.getMatrix());

            this._tempColor.set(bar.displayColor.r, bar.displayColor.g, bar.displayColor.b);

            this.cubeMesh.setColorAt(barIdx, this._tempColor);

            // The cube is centred on posY, so its extent is half the body height either side.
            const halfHeight = cubeHeight / 2;
            const barMinY = bar.posY - halfHeight;
            const barMaxY = bar.posY + halfHeight;

            // Bars without values (past the data, or before an indicator starts) are not drawn.
            const alpha = bar.values.length === 0 ? 0 : this.computeEdgeFadeAlpha(bar.posX, barMinY, barMaxY);

            if (attributeOpacity)
                attributeOpacity.array[barIdx] = alpha;
        }

        this.cubeMesh.instanceMatrix.needsUpdate = true;

        if (this.cubeMesh.instanceColor)
            this.cubeMesh.instanceColor.needsUpdate = true;

        if (attributeOpacity)
            attributeOpacity.needsUpdate = true;

        this.cubeMesh.count = this.chart.numBarsVisible;

        // A sphere cached while count was 0 (line series) is empty and would frustum-cull the bodies.
        this.cubeMesh.boundingSphere = null;

        if (this.cubePickMesh) {
            this.cubePickMesh.instanceMatrix.needsUpdate = true;
            this.cubePickMesh.count = this.chart.numBarsVisible;
            this.cubePickMesh.boundingSphere = null;
        }
    }

    private updateCubePickMatrix(index: number, matrix: Gfx.Matrix4): void {
        if (!this.cubePickMesh)
            return;

        matrix.decompose(this._tempPosition, this._tempQuaternion, this._tempScale);
        this._tempScale.multiplyScalar(Series.CUBE_PICK_SCALE);
        this._tempMatrix.compose(this._tempPosition, this._tempQuaternion, this._tempScale);
        this.cubePickMesh.setMatrixAt(index, this._tempMatrix);
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

            // Map high and low into the same coordinate system as the bars.
            let hNorm;

            if (bar.values.length === 4)
                hNorm = this.valueToWorldY(bar.values[1]);
            else
                hNorm = this.valueToWorldY(bar.values[0]);

            let lNorm;
            if (bar.values.length === 4)
                lNorm = this.valueToWorldY(bar.values[2]);
            else
                lNorm = this.valueToWorldY(bar.values[0]);

            positions[base + 0] = bar.posX;     positions[base + 1] = hNorm; positions[base + 2] = 0;
            positions[base + 3] = bar.posX;     positions[base + 4] = lNorm; positions[base + 5] = 0;

            const barDisplayColor = bar.displayColor;

            const cBase = barIdx * 6;

            colors[cBase + 0] = barDisplayColor.r; colors[cBase + 1] = barDisplayColor.g; colors[cBase + 2] = barDisplayColor.b;
            colors[cBase + 3] = barDisplayColor.r; colors[cBase + 4] = barDisplayColor.g; colors[cBase + 5] = barDisplayColor.b;

            const lineMinY = Math.min(hNorm, lNorm);
            const lineMaxY = Math.max(hNorm, lNorm);
            const lineAlpha = bar.values.length === 0 ? 0 : this.computeEdgeFadeAlpha(bar.posX, lineMinY, lineMaxY);

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
     * Updates the shared LineSegments geometry with connected polylines for each value channel,
     * used when seriesType is Line or LineSmoothed. Each value channel (bar.values[i]) is drawn
     * as its own polyline in a distinct color from Series.LINE_SERIES_COLORS.
     */
    private updateValueLines(): void {
        if (!this.gfxLineMesh || !this.gfxLineGeometry)
            return;

        const positions = this.gfxLineGeometry.attributes.position.array as Float32Array;
        const colors    = this.gfxLineGeometry.attributes.color.array as Float32Array;
        const opacities = this.gfxLineGeometry.attributes.opacity.array as Float32Array | undefined;
        const pointMesh = this.valuePointMesh;
        const pointPickMesh = this.valuePointPickMesh;

        const numValues = this.getNumValueChannels();
        const numBars = this.chart.numBarsVisible;

        let segmentIdx = 0;
        let pointIdx = 0;
        const radius = Math.min(this.chart.barWidth, this.chart.verticalLineDistance) * Series.HOVER_POINT_RADIUS_FACTOR;
        const pickRadius = radius * Series.VALUE_POINT_PICK_RADIUS_MULTIPLIER;

        if (numValues > 0) {
            for (let valueIdx = 0; valueIdx < numValues; valueIdx++) {
                const color = this.getValueChannelColor(valueIdx);

                for (let barIdx = 0; barIdx < numBars; barIdx++) {
                    const bar = this.bars[barIdx];

                    // Bars this series doesn't cover get a zero-scale point, so instance index stays
                    // valueIdx * numBars + barIdx (see resolvePickTarget).
                    if (bar.values.length === 0 || bar.values[valueIdx] === undefined) {
                        this._tempMatrix.makeScale(0, 0, 1);
                        pointMesh?.setMatrixAt(pointIdx, this._tempMatrix);
                        pointMesh?.setColorAt(pointIdx, color);
                        pointPickMesh?.setMatrixAt(pointIdx, this._tempMatrix);
                        pointIdx++;
                        continue;
                    }

                    const y = this.valueToWorldY(bar.values[valueIdx] ?? 0);
                    const isActive = this.isPointActive(barIdx, valueIdx);
                    // Points have no opacity attribute, so they shrink away with the same edge fade as the lines.
                    const pointRadius = isActive ? radius * this.computeEdgeFadeAlpha(bar.posX, y, y) : 0;

                    this._tempMatrix.makeScale(pointRadius, pointRadius, 1);
                    this._tempMatrix.setPosition(bar.posX, y, 0);
                    pointMesh?.setMatrixAt(pointIdx, this._tempMatrix);
                    pointMesh?.setColorAt(pointIdx, color);
                    this._tempMatrix.makeScale(pickRadius, pickRadius, 1);
                    this._tempMatrix.setPosition(bar.posX, y, 0);
                    pointPickMesh?.setMatrixAt(pointIdx, this._tempMatrix);
                    pointIdx++;
                }

                for (let barIdx = 0; barIdx < numBars - 1; barIdx++) {
                    const barA = this.bars[barIdx];
                    const barB = this.bars[barIdx + 1];

                    // Don't bridge gaps: an indicator with no value at a bar (e.g. the leading
                    // bars of an MA) must break the polyline, not be drawn at the axis.
                    if (barA.values.length === 0 || barA.values[valueIdx] === undefined ||
                        barB.values.length === 0 || barB.values[valueIdx] === undefined)
                        continue;

                    const yA = this.valueToWorldY(barA.values[valueIdx] ?? 0);
                    const yB = this.valueToWorldY(barB.values[valueIdx] ?? 0);

                    const base = segmentIdx * 6;

                    positions[base + 0] = barA.posX; positions[base + 1] = yA; positions[base + 2] = 0;
                    positions[base + 3] = barB.posX; positions[base + 4] = yB; positions[base + 5] = 0;

                    colors[base + 0] = color.r; colors[base + 1] = color.g; colors[base + 2] = color.b;
                    colors[base + 3] = color.r; colors[base + 4] = color.g; colors[base + 5] = color.b;

                    if (opacities) {
                        opacities[segmentIdx * 2 + 0] = this.computeEdgeFadeAlpha(barA.posX, yA, yA);
                        opacities[segmentIdx * 2 + 1] = this.computeEdgeFadeAlpha(barB.posX, yB, yB);
                    }

                    segmentIdx++;
                }
            }
        }

        this.gfxLineGeometry.attributes.position.needsUpdate = true;
        this.gfxLineGeometry.attributes.color.needsUpdate    = true;

        if (opacities)
            (this.gfxLineGeometry.attributes.opacity as Gfx.BufferAttribute).needsUpdate = true;

        this.gfxLineGeometry.setDrawRange(0, segmentIdx * 2);

        if (pointMesh) {
            pointMesh.count = pointIdx;
            pointMesh.instanceMatrix.needsUpdate = true;
            if (pointMesh.instanceColor)
                pointMesh.instanceColor.needsUpdate = true;
            pointMesh.computeBoundingSphere();
        }

        if (pointPickMesh) {
            pointPickMesh.count = pointIdx;
            pointPickMesh.instanceMatrix.needsUpdate = true;
            pointPickMesh.computeBoundingSphere();
        }
    }

    /**
     * Finds the bar/value-channel point nearest to a Series-local space point, constrained to a
     * hit box of `maxDistX`/`maxDistY` around each candidate point. Used to detect hover for
     * Line-type series, which have no pickable per-bar geometry (unlike Candlestick's cubes).
     *
     * @returns The nearest matching bar/value indices, or null if nothing is within range.
     */
    public findNearestValuePoint(localPoint: Gfx.Vector2, maxDistX: number, maxDistY: number): { barIndex: number; valueIndex: number; distanceSq: number } | null {
        const numValues = this.getNumValueChannels();

        if (numValues === 0)
            return null;

        let bestBarIndex = -1;
        let bestValueIndex = -1;
        let bestDistSq = Infinity;

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar = this.bars[barIdx];

            const dx = bar.posX - localPoint.x;
            if (Math.abs(dx) > maxDistX)
                continue;

            for (let valueIdx = 0; valueIdx < numValues; valueIdx++) {
                const y = this.valueToWorldY(bar.values[valueIdx] ?? 0);
                const dy = y - localPoint.y;

                if (Math.abs(dy) > maxDistY)
                    continue;

                const distSq = dx * dx + dy * dy;

                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    bestBarIndex = barIdx;
                    bestValueIndex = valueIdx;
                }
            }
        }

        return bestBarIndex >= 0 ? { barIndex: bestBarIndex, valueIndex: bestValueIndex, distanceSq: bestDistSq } : null;
    }

    /**
     * Sets which bar column is currently hovered (Line-type series only) and refreshes the markers
     * of every value channel in that column.
     *
     * A negative `valueIndex` marks the whole column, which is what makes a single hover show a
     * marker on every indicator from top to bottom instead of only on the line nearest the cursor.
     * Pass -1/-1 to clear the hover state.
     */
    public setHoveredValue(barIndex: number, valueIndex: number): void {
        const previousBarIndex = this.hoveredBarIndex;

        if (previousBarIndex === barIndex && this.hoveredValueIndex === valueIndex)
            return;

        this.hoveredBarIndex = barIndex;
        this.hoveredValueIndex = valueIndex;

        // Both columns are refreshed, so moving the cursor never leaves a stale marker behind.
        this.refreshHoverColumnMarkers(previousBarIndex);
        this.refreshHoverColumnMarkers(barIndex);
    }

    public setSelectedValue(barIndex: number, valueIndex: number): void {
        const previousBarIndex = this.selectedValueBarIndex;
        const previousValueIndex = this.selectedValueIndex;
        this.selectedValueBarIndex = barIndex;
        this.selectedValueIndex = valueIndex;

        this.updateValuePointMarker(previousBarIndex, previousValueIndex);
        this.updateValuePointMarker(barIndex, valueIndex);
        this.updateSelectedPoint();
    }

    /**
     * Whether the marker of the given bar/value-channel point should be drawn.
     *
     * A hovered column activates every channel of that bar; an explicitly hovered channel (the
     * point directly under the cursor) activates only itself.
     */
    private isPointActive(barIndex: number, valueIndex: number): boolean {
        if (barIndex === this.selectedValueBarIndex && valueIndex === this.selectedValueIndex)
            return true;

        if (barIndex !== this.hoveredBarIndex)
            return false;

        return this.hoveredValueIndex < 0 || this.hoveredValueIndex === valueIndex;
    }

    /** Re-applies the marker matrices of every value channel of the given bar column. */
    private refreshHoverColumnMarkers(barIndex: number): void {
        if (barIndex < 0)
            return;

        const numValues = this.getNumValueChannels();

        for (let valueIndex = 0; valueIndex < numValues; valueIndex++)
            this.updateValuePointMarker(barIndex, valueIndex);
    }

    private updateValuePointMarker(barIndex: number, valueIndex: number): void {
        const mesh = this.valuePointMesh;
        const numBars = this.chart.numBarsVisible;
        if (!mesh || barIndex < 0 || valueIndex < 0 || barIndex >= numBars)
            return;

        const instanceIndex = valueIndex * numBars + barIndex;
        if (instanceIndex >= mesh.count)
            return;

        const bar = this.bars[barIndex];
        if (!bar || bar.values[valueIndex] === undefined)
            return;

        const isActive = this.isPointActive(barIndex, valueIndex);
        const y = this.valueToWorldY(bar.values[valueIndex] ?? 0);
        const radius = isActive
            ? Math.min(this.chart.barWidth, this.chart.verticalLineDistance) * Series.HOVER_POINT_RADIUS_FACTOR * this.computeEdgeFadeAlpha(bar.posX, y, y)
            : 0;

        this._tempMatrix.makeScale(radius, radius, 1);
        this._tempMatrix.setPosition(bar.posX, y, 0);
        mesh.setMatrixAt(instanceIndex, this._tempMatrix);
        mesh.instanceMatrix.needsUpdate = true;
    }

    public isValueSelected(barIndex: number, valueIndex: number): boolean {
        return this.selectedValueBarIndex === barIndex && this.selectedValueIndex === valueIndex;
    }

    private updateSelectedPoint(): void {
        if (this.seriesType === SeriesType.Candlestick) {
            if (this.selectedPointMesh)
                this.selectedPointMesh.visible = false;
            return;
        }

        if (this.selectedValueBarIndex < 0 || this.selectedValueIndex < 0) {
            if (this.selectedPointMesh)
                this.selectedPointMesh.visible = false;
            return;
        }

        if (!this.selectedPointMesh) {
            this.selectedPointMaterial = new Gfx.MeshBasicMaterial({ color: 0xffff00, depthTest: false });
            this.selectedPointMesh = new Gfx.Mesh(new Gfx.RingGeometry(0.65, 1, 16), this.selectedPointMaterial);
            this.selectedPointMesh.renderOrder = 998;
            this.add(this.selectedPointMesh);
        }

        const bar = this.bars[this.selectedValueBarIndex];
        if (!bar) {
            this.selectedPointMesh.visible = false;
            return;
        }

        const y = this.valueToWorldY(bar.values[this.selectedValueIndex] ?? 0);
        const radius = Math.min(this.chart.barWidth, this.chart.verticalLineDistance) * 0.25;
        this.selectedPointMesh.position.set(bar.posX, y, 0);
        this.selectedPointMesh.scale.set(radius, radius, 1);
        this.selectedPointMesh.visible = true;
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
            const values = [o, h, l, c];
            bar.setValues(date.getTime(), values);
            date.setTime(date.getTime() + 60 * 1000); // Increment by 1 minute for each bar.
        }
        
        this.updateGraphics();
    }

    /**
     * Updates the bars with new data or existing data. Will refresh the visual representation of the bars accordingly for the current window.
     *
     * @param data The new data to update the bars with.
     */
    public updateBars(): void {
        this.setBarsCapacity(this.chart.numBarsVisible);

        if (this.data === null)
            return;

        // One window for the whole chart: a series that starts later (e.g. an MA, which needs
        // `period` bars of history) must be aligned by timestamp rather than by array offset,
        // otherwise it is drawn shifted left and covers the wrong bars.
        const [windowStart, windowEnd] = this.chart.getDataWindow();

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar = this.bars[barIdx];
            const datasetIndex = windowStart + barIdx;
            const slotMs = datasetIndex >= windowStart && datasetIndex < windowEnd
                ? this.chart.timeAtIndex(datasetIndex)
                : 0;

            // The row is looked up by timestamp, so a series that starts later (e.g. an MA, which
            // needs `period` bars of history) lands on the bar it actually belongs to, and the
            // bars it does not cover stay empty instead of borrowing a neighbouring row's values.
            const row = slotMs > 0 ? this.rowAtTime(slotMs) : undefined;

            if (!row) {
                // No data for this slot — leave the bar empty so nothing is drawn for it.
                bar.setValues(0, []);
                continue;
            }

            // `timestamp` is in Unix seconds; bars store milliseconds.
            // `values` is typed as a CppArray, but the wasm layer hands us a plain JS array.
            const values = (row as unknown as { values?: unknown }).values;
            bar.setValues(slotMs, Array.isArray(values) ? values as number[] : []);
        }
    }

    /**
     * The row of this series that applies at the given timestamp (ms), or undefined when the
     * series has no value at that time.
     *
     * Rows are sorted by timestamp, so a binary search finds an exact match. When there is none,
     * the previous row is borrowed only while the requested time still falls inside that row's
     * interval, i.e. less than one row spacing after it. That is what makes an indicator running
     * on a coarser time-frame than the chart (e.g. an H1 MA over M1 bars) cover every bar of its
     * interval, while a series that simply ends earlier (e.g. an MA with a shift) stays empty
     * instead of repeating its last value.
     */
    private rowAtTime(timeMs: number): TesterValuesColumns['values'][number] | undefined {
        const values = this.data?.values;

        if (!values || values.length === 0)
            return undefined;

        let low = 0;
        let high = values.length - 1;

        while (low <= high) {
            const mid = (low + high) >> 1;
            const midTimeMs = Number(values[mid].timestamp) * 1000;

            if (midTimeMs === timeMs)
                return values[mid];

            if (midTimeMs < timeMs)
                low = mid + 1;
            else
                high = mid - 1;
        }

        // `low` is the insertion point, so `low - 1` is the last row before the requested time.
        const previous = low - 1;

        // Nothing before it, so the series does not cover this bar yet.
        if (previous < 0)
            return undefined;

        // The interval a row covers is the distance to the next one. Without a second row there is
        // no way to tell how far a value reaches, so only exact matches are used.
        const spacing = Series.rowSpacing(values);

        if (spacing <= 0)
            return undefined;

        const previousTimeMs = Number(values[previous].timestamp) * 1000;

        return timeMs - previousTimeMs < spacing ? values[previous] : undefined;
    }

    /**
     * Typical distance (ms) between two consecutive rows of the given series.
     *
     * Taken from the last two rows, because that is where the series is guaranteed to be complete
     * (warm-up rows may be missing).
     */
    private static rowSpacing(values: TesterValuesColumns['values']): number {
        if (values.length < 2)
            return 0;

        const last = Number(values[values.length - 1].timestamp) * 1000;
        const beforeLast = Number(values[values.length - 2].timestamp) * 1000;

        return last - beforeLast;
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
        if (!this.cubeMesh || this.seriesType !== SeriesType.Candlestick)
            return;

        const attributeOpacity = this.gfxCubeGeometry.getAttribute('opacity') as Gfx.InstancedBufferAttribute | null;

        for (let barIndex = 0; barIndex < this.chart.numBarsVisible; barIndex++) {
            const bar = this.bars[barIndex];

            if (bar.values.length == 4) {
                // Colorizing bar depending if it is bullish or bearish.
                bar.displayColor.r = bar.values[3] >= bar.values[0] ? 0 : 1;
                bar.displayColor.g = bar.values[3] >= bar.values[0] ? 1 : 0;
                bar.displayColor.b = 0;
            }
            else {
                // If the bar doesn't have 4 values, set it to a default color (e.g., gray).
                bar.displayColor.r = 0.5;
                bar.displayColor.g = 0.5;
                bar.displayColor.b = 0.5;
            }

            this._tempColor.set(bar.displayColor.r, bar.displayColor.g, bar.displayColor.b);

            this.cubeMesh.setColorAt(barIndex, this._tempColor);

            // Update the opacity attribute for this bar based on its fade state.
            if (attributeOpacity) {
                if (bar.values.length == 4) {
                    // The cube is centred on posY, so its extent is half the body height either side.
                    const halfHeight = Math.abs(bar.values[3] - bar.values[0]) * this.unitsPerValue / 2;
                    attributeOpacity.array[barIndex] = this.computeEdgeFadeAlpha(bar.posX, bar.posY - halfHeight, bar.posY + halfHeight);
                }
                else {
                    attributeOpacity.array[barIndex] = this.computeEdgeFadeAlpha(bar.posX, bar.posY, bar.posY);
                }
            }
        }

        if (this.cubeMesh.instanceColor)
            this.cubeMesh.instanceColor.needsUpdate = true;

        if (attributeOpacity)
            attributeOpacity.needsUpdate = true;
    }

    public updateBarColor(barIndex: number): void {
        if (!this.cubeMesh || this.seriesType !== SeriesType.Candlestick ||
            barIndex < 0 || barIndex >= this.chart.numBarsVisible)
            return;

        const bar = this.bars[barIndex];
        this._tempColor.copy(bar.displayColor);

        this.cubeMesh.setColorAt(barIndex, this._tempColor);
        if (this.cubeMesh.instanceColor)
            this.cubeMesh.instanceColor.needsUpdate = true;
    }

    /**
     * Recomputes only the per-instance/per-vertex fade opacity for cubes and lines, without
     * touching matrices or colors. Called every frame so fading stays in sync with scroll/zoom.
     */
    private updateFade(): void {
        // A hidden series draws nothing, so there is no fade to recompute.
        if (!this.visible)
            return;

        if (this.seriesType === SeriesType.Candlestick)
            this.updateCandlestickFade();
        else
            this.updateValueLineFade();
    }

    /** Fade update for Candlestick series (cube boxes + wick lines). */
    private updateCandlestickFade(): void {
        const attributeOpacity = this.gfxCubeGeometry.getAttribute('opacity') as Gfx.InstancedBufferAttribute | null;
        const lineOpacities = this.gfxLineGeometry?.attributes.opacity.array as Float32Array | undefined;

        for (let barIdx = 0; barIdx < this.chart.numBarsVisible; barIdx++) {
            const bar = this.bars[barIdx];

            if (attributeOpacity) {
                if (bar.values.length == 4) {
                    // The cube is centred on posY, so its extent is half the body height either side.
                    const halfHeight = Math.abs(bar.values[3] - bar.values[0]) * this.unitsPerValue / 2;
                    attributeOpacity.array[barIdx] = this.computeEdgeFadeAlpha(bar.posX, bar.posY - halfHeight, bar.posY + halfHeight);
                }
                else {
                    attributeOpacity.array[barIdx] = bar.values.length === 0 ? 0 : this.computeEdgeFadeAlpha(bar.posX, bar.posY, bar.posY);
                }
            }

            if (lineOpacities) {
                if (bar.values.length == 4) {
                    const hNorm = this.valueToWorldY(bar.values[1]);
                    const lNorm = this.valueToWorldY(bar.values[2]);
                    const lineMinY = Math.min(hNorm, lNorm);
                    const lineMaxY = Math.max(hNorm, lNorm);
                    const lineAlpha = this.computeEdgeFadeAlpha(bar.posX, lineMinY, lineMaxY);

                    // Opacity attribute has itemSize 1 (one value per vertex), unlike position/color's itemSize 3.
                    lineOpacities[barIdx * 2 + 0] = lineAlpha;
                    lineOpacities[barIdx * 2 + 1] = lineAlpha;
                }
                else {
                    const lineAlpha = bar.values.length === 0 ? 0 : this.computeEdgeFadeAlpha(bar.posX, bar.posY, bar.posY);

                    // Opacity attribute has itemSize 1 (one value per vertex), unlike position/color's itemSize 3.
                    lineOpacities[barIdx * 2 + 0] = lineAlpha;
                    lineOpacities[barIdx * 2 + 1] = lineAlpha;
                }
            }
        }

        if (attributeOpacity)
            attributeOpacity.needsUpdate = true;

        if (lineOpacities)
            (this.gfxLineGeometry!.attributes.opacity as Gfx.BufferAttribute).needsUpdate = true;
    }

    /** Fade update for Line/LineSmoothed series (connected polylines, one per value channel). */
    private updateValueLineFade(): void {
        const lineOpacities = this.gfxLineGeometry?.attributes.opacity.array as Float32Array | undefined;

        if (!lineOpacities)
            return;

        const numValues = this.getNumValueChannels();
        const numBars = this.chart.numBarsVisible;

        let segmentIdx = 0;

        if (numValues > 0 && numBars > 1) {
            for (let valueIdx = 0; valueIdx < numValues; valueIdx++) {
                for (let barIdx = 0; barIdx < numBars - 1; barIdx++) {
                    const barA = this.bars[barIdx];
                    const barB = this.bars[barIdx + 1];

                    // Must skip the same gap segments as layout, or opacities shift out of sync with segments.
                    if (barA.values.length === 0 || barA.values[valueIdx] === undefined ||
                        barB.values.length === 0 || barB.values[valueIdx] === undefined)
                        continue;

                    const yA = this.valueToWorldY(barA.values[valueIdx] ?? 0);
                    const yB = this.valueToWorldY(barB.values[valueIdx] ?? 0);

                    lineOpacities[segmentIdx * 2 + 0] = this.computeEdgeFadeAlpha(barA.posX, yA, yA);
                    lineOpacities[segmentIdx * 2 + 1] = this.computeEdgeFadeAlpha(barB.posX, yB, yB);

                    segmentIdx++;
                }
            }
        }

        (this.gfxLineGeometry!.attributes.opacity as Gfx.BufferAttribute).needsUpdate = true;

        // Hover markers follow scrolling, so their edge fade has to be refreshed too.
        this.refreshHoverColumnMarkers(this.hoveredBarIndex);
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

            const boxHeight = bar.values.length == 4
                ? Math.abs(bar.values[3] - bar.values[0]) * this.unitsPerValue
                : 0.001;
            bar.updateMatrix(this.chart.barWidth, boxHeight);

            this.cubeMesh.setMatrixAt(i, bar.getMatrix());
            this.updateCubePickMatrix(i, bar.getMatrix());
        }

        this.cubeMesh.instanceMatrix.needsUpdate = true;
        this.cubeMesh.count = count;
        this.cubeMesh.boundingSphere = null;

        if (this.cubePickMesh) {
            this.cubePickMesh.instanceMatrix.needsUpdate = true;
            this.cubePickMesh.count = count;
            this.cubePickMesh.boundingSphere = null;
        }
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