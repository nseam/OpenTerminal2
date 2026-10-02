import * as Gfx from 'three';
import { Series } from './Series';
import { ChartGrid } from './ChartGrid';
import { Renderer } from './../Renderer';
import { type TesterValuesColumns } from 'fx31337-wasm/lib/types/TesterValuesColumns';
import { type TesterIndicatorInfo } from 'fx31337-wasm/lib/types/TesterIndicatorInfo';
import { type IndicatorDataEntry } from 'fx31337-wasm/lib/types/IndicatorDataEntry';
import { Bar } from './Bar';

export class Chart extends Gfx.Object3D
{
    /**
     * Unique identifier for the chart. It's not the id of the Object3D as we need the id to be persistent across sessions.
     */
    public uuid: string = crypto.randomUUID();

    /**
     * Data for each of the series in the chart. Note that there can be timestep-based data and non-timestep-based data (e.g., for Renko series).
     */
    public data: TesterValuesColumns[] | null = null;

    /**
     * List of series to be displayed in the chart.
     */
    public series: Series[] = [];

    /**
     * The grid of the chart. This will be used to display the grid lines on the chart.
     */
    public grid: ChartGrid = new ChartGrid(this);

    /**
     * Number of bars that is currently visible in the chart.
     */
    public numBarsVisible: number = 0;

    /**
     * Initial number of bars in the chart with zoom 1.
     */
    public numInitialBars: number = 0;

    /**
     * The width of each bar in the chart. This will be used to layout the bars in the series.
     */
    public barWidth: number = 0.1;

    /**
     * The spacing between bars in the chart. This will be used to layout the bars in the series.
     */
    public barSpacing: number = 0.05;

    /**
     * The vertical scale factor for the bars in the chart. This will be used to scale the height of the bars.
     */
    public barScaleY: number = 1;

    /**
     * Number of horizontal grid lines in the chart.
     */
    public numHorizontalLines: number = 10;

    /**
     * The width of the chart. This is calculated based on the bounding box of the chart.
     */
    public get chartWidth(): number {
        return this.getBBox().max.x - this.getBBox().min.x;
    }

    /**
     * The height of the bars in the chart. This is calculated based on the bounding box of the chart.
     */
    public get chartHeight(): number {
        return this.getBBox().max.y - this.getBBox().min.y;
    }

    /**
     * Current vertical distance between grid lines, based on the bar width and spacing.
     */
    public get verticalLineDistance(): number {
        return this.chartWidth / this.numBarsVisible / this.zoom;
    }

    /**
     * Current horizontal distance between grid lines, based on the bar width and spacing.
     */
    public get horizontalLineDistance(): number {
        return (this.chartHeight / this.numHorizontalLines) * this.zoom;
    }

    /**
     * The initial (zoom x1) vertical distance between grid lines, based on the bar width and spacing.
     */
    public get initialVerticalLineDistance(): number {
        return this.barWidth + this.barSpacing;
    }

    /**
     * The initial (zoom x1) horizontal distance between grid lines, based on the bar width and spacing.
     */
    public get initialHorizontalLineDistance(): number {
        return this.chartHeight / this.numHorizontalLines;
    }

    /**
     * The start index of the data window currently displayed in the chart. Updated after scroll.
     */
    public startIndex: number = 0;

    /**
     * Horizontal scroll position of the chart
     */
    public scrollX: number = 0;

    /**
     * The vertical scroll position of the chart
     */
    public scrollY: number = 0;

    /**
     * The target horizontal scroll position of the chart. This can be used for smooth scrolling animations.
     */
    public targetScrollX: number = 0;

    /**
     * The target vertical scroll position of the chart. This can be used for smooth scrolling animations.
     */
    public targetScrollY: number = 0;

    /**
     * Indicates whether the bounding box of the chart needs to be recalculated.
     */
    public invalidatedBBox: boolean = true;

    /**
     * The cached bounding box of the chart. This will be recalculated if invalidatedBBox is true.
     */
    public bbox: Gfx.Box3 | null = null;

    /**
     * Cached OHLC values, invalidated whenever new data is set via setData().
     */
    private cachedOHLC: { o: number, h: number, l: number, c: number } | null = null;

    /**
     * The zoom level of the chart. This will be used to scale the chart and its contents.
     */
    private _zoom: number = 1.0;

    /**
     * Gets the current zoom level of the chart.
     */
    public get zoom(): number {
        return this._zoom;
    }

    /**
     * Sets the current zoom level of the chart.
     */
    public set zoom(value: number) {
        this._zoom = value;
        this.numBarsVisible = Math.floor(this.numInitialBars / this._zoom);

        this.refreshSeriesData();
    }

    private _domBarHover: HTMLElement = document.createElement('div');

    private positionBarHover = (event: MouseEvent): void => {
        this._domBarHover.style.left = `${event.pageX + 10}px`;
        this._domBarHover.style.top = `${event.pageY + 10}px`;
    };

    /**
     * Updates the labels on the chart, e.g. hover tooltips.
     */
    public updateLabels(): void {
        if (!this._domBarHover.parentElement) {
            this._domBarHover.classList.add('chart-tooltip');
            document.body.appendChild(this._domBarHover);
            document.addEventListener('mousemove', this.positionBarHover);
        }

        // Displaying the hover tooltip only if the mouse is over a bar.
        let isHoveringOverBar = false;

        let hoveredBar: Bar | null = null;
        let hoveredSeries: Series | null = null;
        
        for (const series of this.series) {
            const visibleBars = Math.min(this.numBarsVisible, series.bars.length);
            for (let barIndex = 0; barIndex < visibleBars; barIndex++) {
                const bar = series.bars[barIndex];
                if (bar.hovered) {
                    isHoveringOverBar = true;
                    hoveredSeries = series;
                    hoveredBar = bar;
                    break;
                }
            }

            if (isHoveringOverBar)
                break;
        }

        this._domBarHover.style.display = isHoveringOverBar ? 'block' : 'none';

        if (hoveredBar && hoveredSeries) {
            this._domBarHover.innerHTML = `Series: ${hoveredSeries.data?.indicator_info.name}<br>Values: ${hoveredBar.values.join(', ')}`;
        }
    }

    /**
     * Called after new data is loaded so external code (e.g. plugins) can react.
     */
    public onDataSet?: () => void;

    /**
     * Returns the start time of the series, or null if there is no data.
     */
    public get startTime(): DateTime | null {
        if (this.series.length === 0 || this.series[0].bars.length === 0)
            return null;
        
        return new DateTime(this.series[0].bars[0].time_ms);
    }

    /**
     * Returns the end time of the series, or null if there is no data.
     */
    public get endTime(): DateTime | null {
        if (this.series.length === 0 || this.series[0].bars.length === 0)
            return null;
        
        return new DateTime(this.series[0].bars[this.series[0].bars.length - 1].time_ms);
    }

    /**
     * Constructor.
     */
    public constructor(numBars: number, barWidth: number = 0.1, barSpacing: number = 0.05) {
        super();

        this.numInitialBars = numBars;
        this.numBarsVisible = numBars;
        this.barWidth = barWidth;
        this.barSpacing = barSpacing;

        this.add(this.grid);
    }

    /**
     * Creates a new series, adds it to the chart, and returns it.
     */
    public addSeries(): Series {
        const series = new Series(this);
        this.series.push(series);
        this.add(series);
        return series;
    }

    /**
     * Sets the data for the chart and immediately feeds all series from the current barsStartIndex.
     *
     * @param data The data to display.
     */
    public setData(data: TesterValuesColumns[] | null): void {
        this.data = data;
        this.cachedOHLC = null;
        this.invalidatedBBox = true;

        if (this.data) {
            for (let i = 0; i < this.data.length; i++) {
                if (this.series.length <= i)
                    this.addSeries();

                this.series[i].setData(this.data[i]);
                
                this.series[i].updateGraphics();
            }
        }
        
        this.scrollTo(0, 0); // Refresh the chart to reflect the new data.
        this.onDataSet?.();
    }

    /**
     * Pushes the current data window (starting at barsStartIndex) to every series.
     */
    private refreshSeriesData(): void {
        for (let i = 0; i < this.series.length; i++) {
            this.series[i].setIndex(i);
            this.series[i].updateGraphics();
        }
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

        return this.series[0].bars.length;
    }

    /**
     * Gets the OHLC (Open, High, Low, Close) values of the chart. This will be calculated based on the series and bars in the chart.
     * 
     * @returns An object containing the OHLC values.
     */
    public getOHLC(): { o: number, h: number, l: number, c: number } {
        if (this.cachedOHLC !== null)
            return this.cachedOHLC;

        let o: number | null = null;
        let h: number | null = null;
        let l: number | null = null;
        let c: number | null = null;

        if (this.data !== null) {
            // Scan the full dataset so the OHLC range covers all bars, not just the visible window.
            for (let i = 0; i < this.data.length; i++) {
                for (const entry of this.data[i].values) {
                    if (entry.values.length == 4) {
                        if (o === null || entry.values[0] < o)
                            o = entry.values[0];

                        if (h === null || entry.values[1] > h)
                            h = entry.values[1];

                        if (l === null || entry.values[2] < l)
                            l = entry.values[2];
                        
                        if (c === null || entry.values[3] > c)
                            c = entry.values[3];
                    }
                    else {
                        // Calculating OHLC from the first item of entry.values.
                        const value = entry.values[0];

                        if (o === null || value < o)
                            o = value;

                        if (h === null || value > h)
                            h = value;

                        if (l === null || value < l)
                            l = value;

                        if (c === null || value > c)
                            c = value;
                    }
                }
            }
        } else {
            // Fallback: no data available, set OHLC to zero.
            o = 0;
            h = 0;
            l = 0;
            c = 0;
        }

        this.cachedOHLC = { o: o ?? 0, h: h ?? 0, l: l ?? 0, c: c ?? 0 };

        return this.cachedOHLC;
    }

    /**
     * Gets the bounding box of the chart. This will be calculated based on the OHLC values of all bars.
     * 
     * @returns The bounding box of the chart.
     */
    public getBBox(): Gfx.Box3 {
        if (!this.invalidatedBBox)
            return this.bbox!;

        const bbox = new Gfx.Box3();

        const ohlc = this.getOHLC();

        // Front/back depth.
        bbox.expandByPoint(new Gfx.Vector3(0, 0, -0.5));
        bbox.expandByPoint(new Gfx.Vector3(0, 0,  0.1));

        // Vertical extent derived from the full price range of the data.
        bbox.expandByPoint(new Gfx.Vector3(0, ohlc.l, 0));
        bbox.expandByPoint(new Gfx.Vector3(0, ohlc.h, 0));

        // Horizontal extent — chart is centered at x=0 so bars and grid lines align.
        const chartWidth = this.numBarsVisible * (this.barWidth + this.barSpacing);
        bbox.expandByPoint(new Gfx.Vector3(-chartWidth / 2, 0, 0));
        bbox.expandByPoint(new Gfx.Vector3( chartWidth / 2, 0, 0));

        this.bbox = bbox;
        this.invalidatedBBox = false;

        return bbox;
    }

    /**
     * Scrolls the chart to the specified position.
     * 
     * @param x The target horizontal scroll position.
     * @param y The target vertical scroll position.
     */
    public scrollTo(x: number, y: number = 0): void {
        this.targetScrollX = Math.max(0, Math.min(x, this.getMaxScrollX()));
        this.targetScrollY = y;
    }

    private getMaxScrollX(): number {
        const dataLength = this.data?.reduce(
            (maxLength, seriesData) => Math.max(maxLength, seriesData.values.length ?? 0),
            0
        ) ?? 0;
        const maxStartIndex = Math.max(0, dataLength - this.numBarsVisible);

        return maxStartIndex * this.verticalLineDistance * this.zoom;
    }

    /**
     * Scrolls the chart by the specified offset.
     * 
     * @param x The horizontal scroll offset.
     * @param y The vertical scroll offset.
     */
    public scrollBy(x: number, y: number = 0): void {
        this.scrollTo(this.targetScrollX + x, this.targetScrollY + y);
    }

    /**
     * Called per frame to update the scroll position of the chart.
     */
    public updateScroll(): void {

        //if (Math.abs(this.targetScrollX - this.scrollX) < 0.001 && Math.abs(this.targetScrollY - this.scrollY) < 0.001)
        //    return;

        const maxScrollX = this.getMaxScrollX();
        this.targetScrollX = Math.max(0, Math.min(this.targetScrollX, maxScrollX));

        // Slowly interpolate the scroll position towards the target to create smooth scrolling.
        this.scrollX += (this.targetScrollX - this.scrollX) * 0.1;
        this.scrollX = Math.max(0, Math.min(this.scrollX, maxScrollX));
        // this.scrollY += (this.targetScrollY - this.scrollY) * 0.01;
        this.scrollY = this.targetScrollY;

        const chartWidth = this.getBBox().max.x - this.getBBox().min.x;
        const chartHeight = this.getBBox().max.y - this.getBBox().min.y;

        // Calculating index of the bar that should be displayed on the left side of the chart. We take into consideration zoom level.
        let barIndex = Math.floor(this.scrollX / this.verticalLineDistance / this.zoom);

        this.startIndex = barIndex;

        let shiftedPositionX = this.scrollX % (this.verticalLineDistance * this.zoom);

        for (const series of this.series) {
            series.position.x = -this.chartWidth / 2 - shiftedPositionX;
            series.position.y = this.targetScrollY;
        }

        this.refreshSeriesData();
    }

    /**
     * Frame id (see Renderer.frameId) at which updateScroll() was last run, used to avoid
     * redoing that work when updateMatrixWorld() is invoked multiple times within the same
     * real frame (e.g. by SSAA's multiple internal render() calls).
     */
    private lastUpdatedFrameId: number = -1;

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        if (Renderer.frameId !== this.lastUpdatedFrameId) {
            this.lastUpdatedFrameId = Renderer.frameId;
            this.updateScroll();
            this.updateLabels();
        }

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