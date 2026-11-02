import * as Gfx from 'three';
import { Series } from './Series';
import { ChartGrid } from './ChartGrid';
import { Renderer } from './../Renderer';
import { type TesterValuesColumns } from 'fx31337-wasm/lib/types/TesterValuesColumns';
import { type TesterIndicatorInfo } from 'fx31337-wasm/lib/types/TesterIndicatorInfo';
import { type IndicatorDataEntry } from 'fx31337-wasm/lib/types/IndicatorDataEntry';
import { ENUM_IDATA_VALUE_RANGE } from 'fx31337-wasm/lib/types/enums/ENUM_IDATA_VALUE_RANGE';
import { Bar } from './Bar';

/**
 * A horizontal line marking the last value of a single price indicator.
 */
export interface ChartLastPriceLine {
    /** The series the value comes from. */
    series: Series;
    /** Name of the indicator. */
    name: string;
    /** The last value (the close price for OHLC indicators). */
    value: number;
    /** World-space Y coordinate of the line inside the chart. */
    worldY: number;
    /** Line color as 0xRRGGBB. */
    color: number;
}

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
     * Fixed height of the chart in world units. The chart's vertical extent never depends on the
     * data any more — indicator values are mapped into this range instead.
     */
    public fixedChartHeight: number = 1.0;

    /**
     * Number of horizontal grid lines in the chart. There are always exactly this many lines.
     */
    public maxHorizontalLines: number = 20;

    /**
     * Maximum number of vertical grid lines (and their labels) drawn on the chart. The actual
     * number can be lower when `minVerticalLineDistance` does not allow that many lines to fit.
     */
    public maxVerticalLines: number = 20;

    /**
     * Minimum distance between two adjacent vertical grid lines, in world units. This keeps the
     * lines and their labels from overlapping when the chart is narrow or zoomed out.
     */
    public minVerticalLineDistance: number = 0.05;

    /**
     * Number of bars between two adjacent vertical grid lines. Chosen so that neither
     * `maxVerticalLines` nor `minVerticalLineDistance` is exceeded.
     *
     * This is derived from the number of *visible* bars, so zooming out (which shows more bars)
     * automatically widens the stride and the line count never exceeds `maxVerticalLines`.
     */
    public get verticalLineStride(): number {
        const numBars = this.numBarsVisible;

        if (numBars <= 0)
            return 1;

        const barSpacingWorld = this.chartWidth / numBars;

        // Enough bars per line to stay within the maximum line count.
        const strideByCount = Math.ceil(numBars / Math.max(1, this.maxVerticalLines));

        // Enough bars per line to keep the lines at least `minVerticalLineDistance` apart.
        const strideByDistance = barSpacingWorld > 0 && this.minVerticalLineDistance > 0
            ? Math.ceil(this.minVerticalLineDistance / barSpacingWorld)
            : 1;

        return Math.max(1, strideByCount, strideByDistance);
    }

    /**
     * Number of vertical grid lines actually drawn on the chart.
     */
    public get numVerticalLines(): number {
        const numBars = this.numBarsVisible;

        if (numBars <= 0)
            return 0;

        return Math.ceil(numBars / this.verticalLineStride);
    }

    /**
     * Distance between two adjacent vertical grid lines, in world units.
     */
    public get verticalGridLineDistance(): number {
        const numBars = this.numBarsVisible;

        if (numBars <= 0)
            return 0;

        return this.verticalLineStride * this.chartWidth / numBars;
    }

    /**
     * Lowest price of the initial price window. Aligned to a multiple of `priceStep`.
     */
    public priceMin: number = 0;

    /**
     * Highest price of the initial price window. Always `priceMin + maxHorizontalLines * priceStep`.
     */
    public priceMax: number = 1;

    /**
     * Price difference between two adjacent horizontal lines.
     */
    public priceStep: number = 0;

    /**
     * Number of decimal digits used to display prices. Taken from the `symbol_digits` of the first
     * price indicator, because a chart only ever displays a single symbol.
     */
    public priceDigits: number = 5;

    /**
     * Whether the chart contains at least one price indicator. When false, the chart has no price
     * axis and non-price indicators are mapped onto a fixed 0..100 range.
     */
    public hasPriceIndicator: boolean = false;

    /**
     * The width of the chart. This is calculated based on the bounding box of the chart.
     */
    public get chartWidth(): number {
        return this.getBBox().max.x - this.getBBox().min.x;
    }

    /**
     * The height of the chart. This is a fixed value — see `fixedChartHeight`.
     */
    public get chartHeight(): number {
        return this.fixedChartHeight;
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
        return (this.chartHeight / this.maxHorizontalLines) * this.zoom;
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
        return this.chartHeight / this.maxHorizontalLines;
    }

    /**
     * Returns true if the given indicator value range represents prices (or price differences),
     * i.e. values that belong on the chart's price axis.
     */
    public static isPriceValueRange(valueRange: ENUM_IDATA_VALUE_RANGE | undefined | null): boolean {
        return valueRange === ENUM_IDATA_VALUE_RANGE.IDATA_RANGE_PRICE ||
            valueRange === ENUM_IDATA_VALUE_RANGE.IDATA_RANGE_PRICE_DIFF ||
            valueRange === ENUM_IDATA_VALUE_RANGE.IDATA_RANGE_PRICE_ON_SIGNAL;
    }

    /**
     * Converts a price into a world-space Y coordinate inside the chart.
     */
    public priceToWorldY(price: number): number {
        if (!this.hasPriceIndicator || this.priceMax <= this.priceMin)
            return 0;

        return (price - this.priceMin) / (this.priceMax - this.priceMin) * this.chartHeight;
    }

    /**
     * Converts a world-space Y coordinate inside the chart back into a price.
     */
    public worldYToPrice(worldY: number): number {
        if (!this.hasPriceIndicator || this.priceMax <= this.priceMin)
            return 0;

        return this.priceMin + (worldY / this.chartHeight) * (this.priceMax - this.priceMin);
    }

    /**
     * Converts a non-price indicator value (0..100) into a world-space Y coordinate inside the
     * chart. Value 0 sits at the bottom of the chart, value 100 at the top.
     */
    public valueToWorldY(value: number): number {
        return value / 100 * this.chartHeight;
    }

    /**
     * Returns the series whose indicator name matches the given indicator type id, or null.
     *
     * The wasm layer names indicators like `(42) MA`, while the UI knows them as `MA`, so the
     * leading `(index) ` prefix is stripped before comparing. Series order does not match the
     * configured indicator order, so matching by name is the only reliable option.
     */
    public findSeriesByIndicatorType(typeId: string): Series | null {
        for (const series of this.series) {
            const name = series.data?.indicator_info?.name;

            if (!name)
                continue;

            if (Chart.stripIndicatorIndex(name) === typeId)
                return series;
        }

        return null;
    }

    /**
     * Removes the `(index) ` prefix the wasm layer puts in front of indicator names.
     */
    public static stripIndicatorIndex(name: string): string {
        return name.replace(/^\(\d+\)\s*/, '');
    }

    /**
     * Shows or hides the series belonging to the given indicator type.
     *
     * Hidden series are skipped by rendering and by the last-price lines, so they disappear from
     * the chart entirely without losing their data.
     */
    public setSeriesVisible(typeId: string, visible: boolean): void {
        let changed = false;

        for (const series of this.series) {
            const name = series.data?.indicator_info?.name;

            if (!name || Chart.stripIndicatorIndex(name) !== typeId)
                continue;

            if (series.visible === visible)
                continue;

            series.visible = visible;
            changed = true;
        }

        // Redraw immediately so the change is visible without waiting for the next scroll/zoom.
        if (changed)
            this.refreshSeriesData();
    }

    /**
     * Assigns an explicit color to the series belonging to the given indicator type.
     *
     * Passing null clears the override, so the series falls back to its palette color.
     */
    public setSeriesColor(typeId: string, color: number | null): void {
        let changed = false;

        for (const series of this.series) {
            const name = series.data?.indicator_info?.name;

            if (!name || Chart.stripIndicatorIndex(name) !== typeId)
                continue;

            series.setColorOverride(color);
            changed = true;
        }

        if (changed)
            this.refreshSeriesData();
    }

    /**
     * Returns one entry per price indicator that has a single value or four values (OHLC).
     *
     * The value used is the indicator's last value — the close price for OHLC indicators. Price
     * indicators with any other number of values are skipped, as their last value cannot be
     * interpreted as a price.
     */
    public get lastPriceLines(): ChartLastPriceLine[] {
        const result: ChartLastPriceLine[] = [];

        for (const series of this.series) {
            if (!series.isPriceSeries)
                continue;

            // Hidden indicators must not contribute a last-price line.
            if (!series.visible)
                continue;

            const values = series.lastValues;

            // Only single-value and OHLC indicators have a meaningful last price.
            if (values.length !== 1 && values.length !== 4)
                continue;

            // For OHLC indicators the last value is the close price.
            const value = values.length === 4 ? values[3] : values[0];

            if (!Number.isFinite(value))
                continue;

            const info = series.data?.indicator_info;

            result.push({
                series,
                name: info?.name ?? '',
                value,
                worldY: this.priceToWorldY(value),
                // Use the color the series is actually drawn with, so the line matches the chart.
                color: series.color,
            });
        }

        return result;
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

        // The price window is only ever computed here — scrolling does not change it.
        this.calculatePriceWindow();

        if (this.data) {
            for (let i = 0; i < this.data.length; i++) {
                if (this.series.length <= i)
                    this.addSeries();

                this.series[i].setData(this.data[i]);
                
                this.series[i].updateGraphics();
            }

            // Dropping series that no longer have data, e.g. after an indicator was removed or
            // the roaming state was restored by undo/redo. Without this they would keep drawing
            // their previous values.
            while (this.series.length > this.data.length)
                this.removeSeries(this.series[this.series.length - 1]);
        }
        else {
            // No data at all, so nothing should be drawn.
            while (this.series.length > 0)
                this.removeSeries(this.series[this.series.length - 1]);
        }
        
        this.scrollTo(0, 0); // Refresh the chart to reflect the new data.
        this.onDataSet?.();
    }

    /**
     * Rounds a number to the given number of decimal digits, removing floating point noise.
     */
    private static roundTo(value: number, digits: number): number {
        const factor = Math.pow(10, digits);
        return Math.round(value * factor) / factor;
    }

    /**
     * Returns the numeric values of an indicator data entry.
     *
     * `IndicatorDataEntry.values` is typed as a `CppArray`, but the wasm layer actually hands us a
     * plain JS array (see `IndicatorDataEntryToVal()` in Tester.h), so it is read defensively.
     */
    public static entryValues(entry: IndicatorDataEntry): number[] {
        const values = (entry as unknown as { values?: unknown }).values;

        return Array.isArray(values) ? values as number[] : [];
    }

    /**
     * Infers the number of decimal digits to use for prices when the indicator does not report a
     * usable `symbol_digits` (the wasm build currently returns 0 for it).
     *
     * The guess is based on the price magnitude, which is what distinguishes the usual forex
     * quoting conventions: 1.09580 (5 digits), 151.234 (3 digits).
     */
    private static inferPriceDigits(maxAbsPrice: number): number {
        if (!Number.isFinite(maxAbsPrice) || maxAbsPrice <= 0)
            return 5;

        if (maxAbsPrice >= 1000)
            return 2;

        if (maxAbsPrice >= 100)
            return 3;

        if (maxAbsPrice >= 10)
            return 4;

        return 5;
    }

    /**
     * Computes the initial price window of the chart from the price indicators in the data.
     *
     * The window always spans exactly `maxHorizontalLines` steps, so every horizontal line has the
     * same price difference to its neighbours. The step is derived from the price range divided by
     * the number of lines and then rounded up to the symbol's precision, which is taken from the
     * first price indicator (a chart only ever displays a single symbol).
     *
     * Only price indicators (`IDATA_RANGE_PRICE`, `IDATA_RANGE_PRICE_DIFF`,
     * `IDATA_RANGE_PRICE_ON_SIGNAL`) contribute to the window — every other indicator is drawn on
     * a fixed 0..100 scale and must not influence the price axis.
     *
     * This is only called from `setData()` — scrolling vertically reveals prices outside of this
     * initial window without changing it.
     */
    private calculatePriceWindow(): void {
        this.hasPriceIndicator = false;
        this.priceMin = 0;
        this.priceMax = 100;
        this.priceStep = 0;

        if (!this.data)
            return;

        let min: number | null = null;
        let max: number | null = null;
        let reportedDigits: number | null = null;

        for (const seriesData of this.data) {
            const info = seriesData.indicator_info;

            if (!Chart.isPriceValueRange(info?.value_range))
                continue;

            // The first price indicator defines the precision of every price on the chart.
            if (reportedDigits === null && Number.isInteger(info.symbol_digits) && info.symbol_digits > 0)
                reportedDigits = info.symbol_digits;

            for (const entry of seriesData.values) {
                for (const value of Chart.entryValues(entry)) {
                    if (!Number.isFinite(value))
                        continue;

                    if (min === null || value < min)
                        min = value;

                    if (max === null || value > max)
                        max = value;
                }
            }
        }

        if (min === null || max === null)
            return;

        this.hasPriceIndicator = true;

        // Fall back to a magnitude-based guess when the indicator reports no usable precision.
        const digits = reportedDigits ?? Chart.inferPriceDigits(Math.max(Math.abs(min), Math.abs(max)));

        this.priceDigits = digits;

        const precision = Math.pow(10, -digits);
        const numLines = this.maxHorizontalLines;

        // Highest price rounded up and lowest price rounded down to the symbol's precision.
        const upper = Chart.roundTo(Math.ceil(max / precision) * precision, digits);
        const lower = Chart.roundTo(Math.floor(min / precision) * precision, digits);

        let diff = upper - lower;

        if (diff <= 0) {
            // Flat data — fall back to one precision unit per line so the window stays usable.
            diff = precision * numLines;
        }

        // Raw step, rounded up to the symbol's precision so every line lands on a valid price.
        let step = Chart.roundTo(Math.ceil((diff / numLines) / precision) * precision, digits);

        if (step <= 0)
            step = precision;

        // Aligning the window to whole steps keeps the price difference between lines constant.
        // Aligning the lower bound down can lose up to one step, so the step is grown until the
        // window covers the rounded upper price again. Recomputing the required step directly
        // converges in one or two passes.
        let alignedLower = Chart.roundTo(Math.floor(lower / step) * step, digits);
        let alignedUpper = Chart.roundTo(alignedLower + step * numLines, digits);

        for (let pass = 0; pass < 8 && alignedUpper < upper; pass++) {
            const required = (upper - alignedLower) / numLines;
            step = Chart.roundTo(Math.ceil(required / precision) * precision, digits);

            if (step <= 0)
                step = precision;

            alignedLower = Chart.roundTo(Math.floor(lower / step) * step, digits);
            alignedUpper = Chart.roundTo(alignedLower + step * numLines, digits);
        }

        this.priceStep = step;
        this.priceMin = alignedLower;
        this.priceMax = alignedUpper;
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
                    const values = Chart.entryValues(entry);

                    if (values.length == 4) {
                        if (o === null || values[0] < o)
                            o = values[0];

                        if (h === null || values[1] > h)
                            h = values[1];

                        if (l === null || values[2] < l)
                            l = values[2];
                        
                        if (c === null || values[3] > c)
                            c = values[3];
                    }
                    else if (values.length > 0) {
                        // Calculating OHLC from the first item of entry.values.
                        const value = values[0];

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
     * Gets the bounding box of the chart. The vertical extent is fixed (see `fixedChartHeight`) and
     * no longer derived from the data — indicator values are mapped into it instead.
     *
     * The chart is flat (2D): it has no depth, so the box spans z = 0 only.
     * 
     * @returns The bounding box of the chart.
     */
    public getBBox(): Gfx.Box3 {
        if (!this.invalidatedBBox)
            return this.bbox!;

        const bbox = new Gfx.Box3();

        // Vertical extent is fixed and starts at y = 0.
        bbox.expandByPoint(new Gfx.Vector3(0, 0, 0));
        bbox.expandByPoint(new Gfx.Vector3(0, this.chartHeight, 0));

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

        // Without a price indicator there is no price axis to scroll through, so the chart stays put.
        if (!this.hasPriceIndicator)
            this.targetScrollY = 0;

        // Slowly interpolate the scroll position towards the target to create smooth scrolling.
        this.scrollX += (this.targetScrollX - this.scrollX) * 0.1;
        this.scrollX = Math.max(0, Math.min(this.scrollX, maxScrollX));
        // this.scrollY += (this.targetScrollY - this.scrollY) * 0.01;
        this.scrollY = this.targetScrollY;

        // Calculating index of the bar that should be displayed on the left side of the chart. We take into consideration zoom level.
        let barIndex = Math.floor(this.scrollX / this.verticalLineDistance / this.zoom);

        this.startIndex = barIndex;

        let shiftedPositionX = this.scrollX % (this.verticalLineDistance * this.zoom);

        for (const series of this.series) {
            series.position.x = -this.chartWidth / 2 - shiftedPositionX;
            // Only price series follow the vertical scroll — non-price indicators (e.g. 0..100)
            // keep a static vertical position so they never leave the chart.
            series.position.y = series.isPriceSeries ? this.targetScrollY : 0;
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
            symbol_digits: 5,
            tf:         1,
            value_range: ENUM_IDATA_VALUE_RANGE.IDATA_RANGE_PRICE,
        } as TesterIndicatorInfo;

        return {
            indicator_info,
            // Centre timestamp of the dataset in milliseconds.
            time_ms: (startTimeSec + Math.floor(COUNT / 2) * 60) * 1000,
            values,
        };
    }
}