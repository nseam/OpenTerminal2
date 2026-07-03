import * as Gfx from 'three';

export class Bar
{
    /**
     * The previous bar. We will use it to check whether the value is increasing or decreasing.
     */
    public previousBar: Bar | null = null;

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

    /**
     * Constructor.
     */
    public constructor(previousBar: Bar | null = null) {
        this.previousBar = previousBar;
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
     * @param o Open price.
     * @param h High price.
     * @param l Low price.
     * @param c Close price.
     */
    public setValues(o: number, h: number, l: number, c: number): void {
        this.o = o;
        this.h = h;
        this.l = l;
        this.c = c;

        // Update the base color of the bar based on the previous bar's close price.
        if (this.previousBar) {
            if (c > this.previousBar.c) {
                this._baseColor.set(0x00ff00); // Green for increasing
            } else if (c < this.previousBar.c) {
                this._baseColor.set(0xff0000); // Red for decreasing
            } else {
                this._baseColor.set(0x0000ff); // Blue for no change
            }
        }
    }

    /**
     * Updates the per-instance matrix with position and scale encoded.
     * The box geometry is a unit cube (1×1×1); scale is applied via the matrix's 
     * scaling component so that InstancedMesh renders bars of different heights.
     *
     * @param barWidth  Width of each bar (x-scale).
     */
    public updateMatrix(barWidth: number, boxHeight: number): void {
        const boxY = (this.c + this.o) / 2;
        // Build a matrix that encodes position + scale for the unit-cube geometry.
        this._matrix.compose(
            new Gfx.Vector3(this.posX, boxY, 0),
            new Gfx.Quaternion(),
            new Gfx.Vector3(barWidth, Math.max(boxHeight, 0.001), barWidth)
        );
    }

    /**
     * Returns the instance matrix for this bar.
     */
    public getMatrix(): Gfx.Matrix4 {
        return this._matrix;
    }
}