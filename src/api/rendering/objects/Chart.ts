import * as Gfx from 'three';
import { type Series } from './Series';
import { ChartGrid } from './ChartGrid';
import { type TesterValuesColumns } from 'fx31337-wasm/lib/types/TesterValuesColumns';
import { type TesterIndicatorInfo } from 'fx31337-wasm/lib/types/TesterIndicatorInfo';
import { type IndicatorDataEntry } from 'fx31337-wasm/lib/types/IndicatorDataEntry';

export class Chart extends Gfx.Object3D
{
    // Unique identifier for the chart. It's not the id of the Object3D as we need the id to be persistent across sessions.
    public uuid: string = crypto.randomUUID();

    // List of series to be displayed in the chart.
    public series: Series[] = [];

    // The grid of the chart. This will be used to display the grid lines on the chart.
    public grid: ChartGrid = new ChartGrid(this);

    // Number of bars currently in the chart.
    public numBars: number = 0;

    // Initial number of bars in the chart with zoom 1.
    private _initialNumBars: number = 0;

    // The width of each bar in the chart. This will be used to layout the bars in the series.
    public barWidth: number = 0.1;

    // The spacing between bars in the chart. This will be used to layout the bars in the series.
    public barSpacing: number = 0.05;

    // The zoom level of the chart. This will be used to scale the chart and its contents.
    public _zoom: number = 1.0;

    // The index of the first bar to be displayed in the chart. This will be used to scroll the chart when the user scrolls.
    public barsStartIndex: number = 0;

    // The data for the chart, shared across all series.
    private _data: TesterValuesColumns | null = null;

    // Called after new data is loaded so external code (e.g. plugins) can react.
    public onDataSet?: () => void;

    public get zoom(): number {
        return this._zoom;
    }

    public set zoom(value: number) {
        this._zoom = value;

        // Update the grid and series to reflect the new zoom level.
        for (const series of this.series)
            series.setNumBarsDisplayed(this.numBars / this._zoom, this.barWidth, this.barSpacing);

        this._refreshSeriesData();
    }

    public get numHorizontalGridLines(): number {
        return this._initialNumBars;
    }

    /** Returns the start time of the series, or null if there is no data. */
    public get startTime(): DateTime | null {
        if (this.series.length === 0 || this.series[0].bars.length === 0)
            return null;
        
        return new DateTime(this.series[0].bars[0].time_ms);
    }

    /** Returns the end time of the series, or null if there is no data. */
    public get endTime(): DateTime | null {
        if (this.series.length === 0 || this.series[0].bars.length === 0)
            return null;
        
        return new DateTime(this.series[0].bars[this.series[0].bars.length - 1].time_ms);
    }

    /**
     * Construtor.
     */
    public constructor(numBars: number, barWidth: number = 0.1, barSpacing: number = 0.05) {
        super();

        this._initialNumBars = numBars;
        this.numBars = numBars;
        this.barWidth = barWidth;
        this.barSpacing = barSpacing;

        this.add(this.grid);
    }

    /**
     * Sets the data for the chart and immediately feeds all series from the current barsStartIndex.
     *
     * @param data The data to display.
     */
    public setData(data: TesterValuesColumns): void {
        this._data = data;
        this._refreshSeriesData();
        this.scrollByPixels(0, 0); // Refresh the chart to reflect the new data.
        this.onDataSet?.();
    }

    /**
     * Pushes the current data window (starting at barsStartIndex) to every series.
     */
    private _refreshSeriesData(): void {
        if (this._data === null)
            return;

        for (const series of this.series)
            series.updateBarsFromData(this._data, this.barsStartIndex);
    }

    /**
     * Adds a series to the chart.
     *
     * @param series The series to add.
     */
    public addSeries(series: Series): void {
        if (this.series.includes(series)) {
            console.warn('Series is already added to the chart.');
            return;
        }

        this.series.push(series);

        this.add(series);

        series.setNumBarsDisplayed(this.numBars / this._zoom, this.barWidth, this.barSpacing);
    }

    /**
     * Removes a series from the chart.
     *
     * @param series The series to remove.
     */
    public removeSeries(series: Series): void {
        const index = this.series.indexOf(series);
        if (index === -1) {
            console.warn('Series is not part of the chart.');
            return;
        }

        this.series.splice(index, 1);
        this.remove(series);
    }
    
    /**
     * Return number of bars for the first series in the chart. If there are no series, return 0.
     */
    public getNumBars(): number {
        if (this.series.length === 0)
            return 0;

        return this.series[0].getNumBars();
    }

    /**
     * Gets the OHLC (Open, High, Low, Close) values of the chart. This will be calculated based on the series and bars in the chart.
     * 
     * @returns An object containing the OHLC values.
     */
    public getOHLC(): { o: number, h: number, l: number, c: number } {
        let o: number | null = null;
        let h: number | null = null;
        let l: number | null = null;
        let c: number | null = null;

        if (this._data !== null) {
            // Scan the full dataset so the OHLC range covers all bars, not just the visible window.
            for (const entry of this._data.values) {
                const ohlc = entry.values;
                if (o === null || ohlc[0] < o) o = ohlc[0];
                if (h === null || ohlc[1] > h) h = ohlc[1];
                if (l === null || ohlc[2] < l) l = ohlc[2];
                if (c === null || ohlc[3] > c) c = ohlc[3];
            }
        } else {
            // Fallback: collect from the currently visible bar objects.
            for (const series of this.series) {
                for (const bar of series.bars) {
                    if (o === null || bar.o < o) o = bar.o;
                    if (h === null || bar.h > h) h = bar.h;
                    if (l === null || bar.l < l) l = bar.l;
                    if (c === null || bar.c > c) c = bar.c;
                }
            }
        }

        return { o: o ?? 0, h: h ?? 0, l: l ?? 0, c: c ?? 0 };
    }

    /**
     * Gets the bounding box of the chart. This will be calculated based on the OHLC values of all bars.
     * 
     * @returns The bounding box of the chart.
     */
    public getBBox(): Gfx.Box3 {
        const bbox = new Gfx.Box3();

        const ohlc = this.getOHLC();

        // Front/back depth.
        bbox.expandByPoint(new Gfx.Vector3(0, 0, -0.5));
        bbox.expandByPoint(new Gfx.Vector3(0, 0,  0.1));

        // Vertical extent derived from the full price range of the data.
        bbox.expandByPoint(new Gfx.Vector3(0, ohlc.l, 0));
        bbox.expandByPoint(new Gfx.Vector3(0, ohlc.h, 0));

        // Horizontal extent — chart is centered at x=0 so bars and grid lines align.
        const chartWidth = this.numBars * (this.barWidth + this.barSpacing);
        bbox.expandByPoint(new Gfx.Vector3(-chartWidth / 2, 0, 0));
        bbox.expandByPoint(new Gfx.Vector3( chartWidth / 2, 0, 0));

        return bbox;
    }

    /**
     * Scrolls the chart by a given number of pixels. This will shift the position of the bars and grid lines in the chart. When the first bars go out of view, we will shift the index from which we are displaying the bars.
     * This will allow us to display more bars in the chart without having to load all the data at once.
     * 
     * @param deltaX The number of pixels to scroll horizontally.
     */
    public scrollByPixels(deltaX: number, deltaY: number = 0): void {
        const barStep = this.barWidth + this.barSpacing;

        // gridLinesShiftX/Y are the single accumulated scroll values (world units).
        this.grid.gridLinesShiftX -= deltaX;
        this.grid.gridLinesShiftY -= deltaY;

        const effectiveStep   = barStep * this._zoom;   // bar width in world units at current zoom
        const chartWidth      = this.numBars * barStep;

        // Clamp gridLinesShiftX so the last bar cannot scroll past the right edge.
        const totalBars  = this._data !== null ? this._data.values.length : 0;
        const barsVisible = this.numBars / this._zoom;
        const maxIndex   = Math.max(0, totalBars - 1);
        const maxStartIndex = Math.max(0, totalBars - barsVisible);
        if (this.grid.gridLinesShiftX < 0)
            this.grid.gridLinesShiftX = 0;
        if (this.grid.gridLinesShiftX > maxStartIndex * effectiveStep)
            this.grid.gridLinesShiftX = maxStartIndex * effectiveStep;

        // Derive barsStartIndex from total scroll: more scroll = higher index = newer data.
        this.barsStartIndex = Math.min(maxIndex, Math.floor(this.grid.gridLinesShiftX / effectiveStep));

        // Sub-bar fractional visual offset: bars slide LEFT as gridLinesShiftX grows
        // (drag right), so new data enters from the right edge on each barStep wrap.
        const visualOffset = this.grid.gridLinesShiftX % effectiveStep;
        
        for (const series of this.series) {
            series.position.x = -chartWidth / 2 - visualOffset;
            series.position.y = -this.grid.gridLinesShiftY;
        }

        this._refreshSeriesData();
    }

    /**
     * Snaps gridLinesShiftX to the nearest zoom-1 bar boundary.
     */
    public snapToNearestBar(): void {
        const barStep       = this.barWidth + this.barSpacing;
        const effectiveStep = barStep * this._zoom;
        const totalBars     = this._data !== null ? this._data.values.length : 0;
        const barsVisible   = this.numBars / this._zoom;
        const maxStartIndex = Math.max(0, totalBars - barsVisible);

        // Floor to the current zoom-1 bar boundary to avoid snapping forward in the scroll direction.
        const snapped = Math.floor(this.grid.gridLinesShiftX / barStep) * barStep;
        this.grid.gridLinesShiftX = Math.max(0, Math.min(snapped, maxStartIndex * effectiveStep));

        const maxIndex = Math.max(0, totalBars - 1);
        this.barsStartIndex = Math.min(maxIndex, Math.floor(this.grid.gridLinesShiftX / effectiveStep));
        const visualOffset = this.grid.gridLinesShiftX % effectiveStep;
        const chartWidth   = this.numBars * barStep;
        for (const series of this.series) {
            series.position.x = -chartWidth / 2 - visualOffset;
            series.position.y = -this.grid.gridLinesShiftY;
        }
        this._refreshSeriesData();
    }

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);
    }

    /**
     * Creates a TesterValuesColumns object populated with 10 000 randomised OHLC bars,
     * each bar 1 minute apart. The open price of every bar equals the close of the
     * previous bar so the series forms a continuous price walk.
     *
     * @returns A TesterValuesColumns instance with mock indicator data.
     */
    public static randomizeData(): TesterValuesColumns {
        const COUNT = 10_000;
        const startTimeSec = Math.floor(Date.now() / 1000);
        const MIN_PRICE = 0.1;
        const MAX_PRICE = 0.7;

        const values: IndicatorDataEntry[] = [];
        let prevClose = MIN_PRICE + Math.random() * (MAX_PRICE - MIN_PRICE);

        for (let i = 0; i < COUNT; i++) {
            const timestamp = BigInt(startTimeSec + i * 60);
            const open  = prevClose;
            const wick  = Math.random() * 0.005;          // max wick extent
            const body  = (Math.random() - 0.5) * 0.1;  // body direction & size
            let close = open + body;
            
            // Clamp close to stay within [MIN_PRICE, MAX_PRICE]
            close = Math.max(MIN_PRICE, Math.min(MAX_PRICE, close));
            
            const high  = Math.max(open, close) + wick;
            const low   = Math.min(open, close) - wick;

            prevClose = close;

            // Plain object that duck-types IndicatorDataEntry.
            // Only the fields/methods consumed by updateBarsFromData() are implemented.
            const entry = {
                timestamp,
                flags: 0,
                values: [open, high, low, close],
            } as unknown as IndicatorDataEntry;

            values.push(entry);
        }

        const indicator_info: TesterIndicatorInfo = {
            name:       'Randomized',
            index:      0,
            num_values: 4,
            symbol:     'EURUSD',
            tf:         1,
        } as TesterIndicatorInfo;

        return {
            indicator_info,
            // Centre timestamp of the dataset in milliseconds.
            time_ms: (startTimeSec + Math.floor(COUNT / 2) * 60) * 1000,
            values,
        };
    }
}