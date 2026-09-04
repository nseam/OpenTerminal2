import * as Gfx from 'three';

export class Bar
{
    /**
     * The previous bar. We will use it to check whether the value is increasing or decreasing.
     */
    public previousBar: Bar | null = null;

    /**
     * The time of the bar in milliseconds since epoch.
     */
    public time_ms: number = 0;

    /**
     * Open price.
     */
    public o: number = 0;

    /**
     * High price.
     */
    public h: number = 0;

    /**
     * Low price.
     */
    public l: number = 0;

    /**
     * Close price.
     */
    public c: number = 0;

    /**
     * Whether the bar is currently selected. This can be used to highlight the bar in the chart.
     */
    public selected: boolean = false;

    /**
     * Whether the bar is currently hovered. This can be used to highlight the bar in the chart.
     */
    public hovered: boolean = false;

    // Per-instance matrix for InstancedMesh (position + scale encoded together).
    private _matrix = new Gfx.Matrix4();

    // Base color derived from OHLC relationship to previous bar.
    private _baseColor: Gfx.Color = new Gfx.Color(0x00ff00);

    // Temporary color object reused when setting instance color.
    private _tempColor: Gfx.Color = new Gfx.Color();

    // The x position set by Series.layoutBars.
    public posX: number = 0;

    /** Normalized Y coordinate (0-1 relative to BBox) set by Series.layoutBars. */
    public posY: number = 0;

    /** Scale values proportional to chart dimensions, set by Series.layoutBars. */
    public _scaleWidth: number = 0.3;
    public _scaleBoxY: number = 0.3;
    public _scaleZ: number = 0.3;

    /**
     * Constructor.
     */
    public constructor() {
        this._baseColor.set(0x00ff00); // Default green
    }

    /**
     * The computed color for this bar, taking into account base color,
     * selection, and hover states. Returns a new Color each call to avoid
     * mutation issues — callers should copy the value if they intend to mutate it.
     */
    public get displayColor(): Gfx.Color {
        if (this.selected) {
            this._tempColor.set(0xffff00); // Yellow for selected
        } else if (this.hovered) {
            this._tempColor.set(0x00ffff); // Cyan for hovered
        } else {
            this._tempColor.copy(this._baseColor);
        }
        return this._tempColor;
    }

    /**
     * Sets the values of the bar.
     * @param time_ms The time of the bar in milliseconds since epoch.
     * @param o Open price.
     * @param h High price.
     * @param l Low price.
     * @param c Close price.
     */ 
    public setValues(time_ms: number, o: number, h: number, l: number, c: number): void {
        this.time_ms = time_ms;
        this.o = o;
        this.h = h;
        this.l = l;
        this.c = c;

        // Update the base color based on close vs open (works even without previousBar).
        if (c > o) {
            this._baseColor.set(0x00ff00); // Green for bullish candle
        } else if (c < o) {
            this._baseColor.set(0xff0000); // Red for bearish candle
        } else {
            this._baseColor.set(0x0000ff); // Blue for doji/flat
        }
    }

    /**
     * Updates the per-instance matrix with position and scale encoded.
     * The box geometry is a unit cube (1×1×1); scale is applied via the matrix's 
     * scaling component so that InstancedMesh renders bars of different heights.
     *
     * @param _chartWidth  Chart width in world units (used for Y-to-world conversion).
     * @param _boxHeight   The original raw OHLC height (deprecated — use _scaleBoxY instead).
     */
    public updateMatrix(_chartWidth: number, _boxHeight: number): void {
        // Use normalized coordinates relative to BBox (0-1 range).
        const worldY = this.posY;
        const scale = new Gfx.Vector3(
            this._scaleWidth,
            Math.max(this._scaleBoxY, 0.001),
            this._scaleZ
        );
        // Build a matrix that encodes position + scale for the unit-cube geometry.
        this._matrix.compose(
            new Gfx.Vector3(this.posX, worldY, 0),
            new Gfx.Quaternion(),
            scale
        );
    }

    /**
     * Returns the instance matrix for this bar.
     */
    public getMatrix(): Gfx.Matrix4 {
        return this._matrix;
    }
}