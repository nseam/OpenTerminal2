import * as Gfx from 'three';
import { Series } from './Series';
import { ChartGrid } from './ChartGrid';
import { Renderer } from './../Renderer';
import { AppStaticSettings } from '../../data/AppStaticSettings';
import { type TesterValuesColumns } from 'fx31337-wasm/lib/types/TesterValuesColumns';
import { type TesterIndicatorInfo } from 'fx31337-wasm/lib/types/TesterIndicatorInfo';
import { type IndicatorDataEntry } from 'fx31337-wasm/lib/types/IndicatorDataEntry';
import { ENUM_IDATA_VALUE_RANGE } from 'fx31337-wasm/lib/types/enums/ENUM_IDATA_VALUE_RANGE';

/**
 * A horizontal line marking the last value of a single price indicator.
 */
export interface ChartLastPriceLine {
    /** The series the value comes from. */
    series: Series;
    /** Name of the indicator. */
    name: string;
    /** Title of the value the line marks (e.g. "Close" for OHLC), or an empty string. */
    valueTitle: string;
    /** The last value (the close price for OHLC indicators). */
    value: number;
    /** World-space Y coordinate of the line inside the chart. */
    worldY: number;
    /** Line color as 0xRRGGBB. */
    color: number;
    /**
     * How strongly the line is dimmed, 0..1. Mirrors `Series.dimFactor`, so the line fades together
     * with the series it belongs to.
     */
    dimFactor: number;
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
     * Releases the DOM elements the chart created. Call after removing the chart from the scene.
     */
    public dispose(): void {
        this.grid.dispose();
    }

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
    public maxVerticalLines: number = 25;

    /**
     * Minimum distance between two adjacent vertical grid lines, in world units. This keeps the
     * lines and their labels from overlapping when the chart is narrow or zoomed out.
     */
    public minVerticalLineDistance: number = 0.05;

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
     * Current world-space distance between two adjacent bars, i.e. the on-screen bar spacing.
     *
     * This follows the zoom level, so it is the right reference for anything that has to stay
     * proportional to the bars on screen (edge fade, hover markers). Use `barStep` for the
     * unzoomed spacing that `scrollX` is expressed in.
     */
    public get verticalLineDistance(): number {
        return this.worldPerBar;
    }

    /**
     * Current vertical distance between horizontal grid lines.
     *
     * Zooming is horizontal only, so the vertical spacing never changes with the zoom level.
     */
    public get horizontalLineDistance(): number {
        return this.chartHeight / this.maxHorizontalLines;
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
     * Lowest value of the default non-price indicator window. Indicators whose values fit this
     * window (e.g. RSI, Stochastic) are drawn on the conventional 0..100 scale.
     */
    public static readonly DEFAULT_VALUE_MIN: number = 0;

    /**
     * Highest value of the default non-price indicator window.
     */
    public static readonly DEFAULT_VALUE_MAX: number = 100;

    /**
     * Converts a non-price indicator value into a world-space Y coordinate inside the chart.
     *
     * The value is mapped from the given window onto the chart's full height, so `valueMin` sits
     * at the bottom of the chart and `valueMax` at the top. The window defaults to 0..100, but
     * indicators that use another scale (e.g. WPR, which is -100..0) pass their own window —
     * otherwise their values would be mapped outside of the chart and never be drawn.
     */
    public valueToWorldY(
        value: number,
        valueMin: number = Chart.DEFAULT_VALUE_MIN,
        valueMax: number = Chart.DEFAULT_VALUE_MAX
    ): number {
        const range = valueMax - valueMin;

        if (!Number.isFinite(range) || range <= 0)
            return 0;

        return (value - valueMin) / range * this.chartHeight;
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

    /** User-given indicator names by indicator type id, shown in the chart's popups. */
    private indicatorNames: Record<string, string> = {};

    /**
     * Sets the names the popups show for the indicators, keyed by indicator type id.
     * The first indicator of a type wins, because series are matched by type.
     */
    public setIndicatorNames(names: Record<string, string>): void {
        this.indicatorNames = names;
        this.grid.updateLabels();
    }

    /**
     * Returns the name to show for a series' `indicator_info.name` (e.g. `(42) MA`): the
     * user-given name, or the type id when none is set.
     */
    public getIndicatorDisplayName(rawName: string | undefined): string {
        const typeId = Chart.stripIndicatorIndex(rawName ?? '');

        return this.indicatorNames[typeId]?.trim() || typeId;
    }

    /**
     * Removes the `(index) ` prefix the wasm layer puts in front of indicator names.
     */
    public static stripIndicatorIndex(name: string): string {
        return name.replace(/^\(\d+\)\s*/, '');
    }

    /**
     * Returns the titles of the values of the given indicator, in the order the values are emitted.
     *
     * The titles are configured in `AppStaticSettings` and follow the buffer names MetaTrader uses
     * for the same indicator (e.g. Alligator's Jaw, Teeth and Lips). An empty array is returned for
     * indicators that have no configured titles, so callers can fall back to unlabelled values.
     *
     * @param indicatorName The `indicator_info.name` of the series, e.g. `(42) Alligator`.
     */
    public static getValueTitles(indicatorName: string | undefined): string[] {
        if (!indicatorName)
            return [];

        const typeId = Chart.stripIndicatorIndex(indicatorName);
        const indicator = AppStaticSettings.indicators.find(candidate => candidate.typeId === typeId);

        return indicator?.valueTitles ?? [];
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
     * Fades every series except the ones belonging to `highlightedTypeId`.
     *
     * Used while the user hovers an indicator's settings, so the indicator being configured stands
     * out from the rest of the chart. Passing `null` restores every series to full opacity.
     *
     * When an indicator is isolated (see `setSeriesIsolated()`) the isolation keeps dimming the
     * other indicators, but the hovered one is shown at full opacity as well, so it can be compared
     * against the isolated one.
     *
     * @param highlightedTypeId Indicator type to keep at full opacity, or `null` for none.
     * @param dimFactor Opacity applied to the other indicators, 0..1.
     */
    public setSeriesDimmed(highlightedTypeId: string | null, dimFactor: number = Chart.DIMMED_OPACITY): void {
        this.hoveredTypeId = highlightedTypeId;
        this.applySeriesDimming(dimFactor);
    }

    /**
     * Isolates a single indicator: it stays at full opacity while every other indicator is faded.
     *
     * This is the persistent counterpart of the hover highlight — it is driven by the chart's
     * "Isolate" selector rather than by the pointer. Passing `null` turns isolation off.
     *
     * @param isolatedTypeId Indicator type to keep at full opacity, or `null` to show everything.
     * @param dimFactor Opacity applied to the other indicators, 0..1.
     */
    public setSeriesIsolated(isolatedTypeId: string | null, dimFactor: number = Chart.DIMMED_OPACITY): void {
        this.isolatedTypeId = isolatedTypeId;
        this.applySeriesDimming(dimFactor);
    }

    /**
     * Indicator type the user isolated through the chart's "Isolate" selector, or `null`.
     */
    public isolatedTypeId: string | null = null;

    /**
     * Indicator type whose settings panel is currently hovered, or `null`.
     */
    private hoveredTypeId: string | null = null;

    /**
     * Pushes the current dim factors to every series and redraws the parts of the grid that mirror
     * them.
     *
     * The isolated indicator and the hovered one are both kept at full opacity; everything else is
     * faded. When neither is set every series is drawn normally.
     */
    private applySeriesDimming(dimFactor: number): void {
        const highlighted = new Set<string>();

        if (this.isolatedTypeId !== null)
            highlighted.add(this.isolatedTypeId);

        if (this.hoveredTypeId !== null)
            highlighted.add(this.hoveredTypeId);

        for (const series of this.series) {
            const name = series.data?.indicator_info?.name;
            const typeId = name ? Chart.stripIndicatorIndex(name) : null;
            const dimmed = highlighted.size > 0 && (typeId === null || !highlighted.has(typeId));

            series.setDimFactor(dimmed ? dimFactor : 1);
        }

        // The last-price lines and their labels are drawn by the grid, which reads the series' dim
        // factors, so it has to be redrawn as well.
        this.grid.updateColors();
        this.grid.updateLabels();
    }

    /** Opacity applied to the indicators that are not being configured. */
    public static readonly DIMMED_OPACITY: number = 0.03;

    /**
     * Assigns one explicit color per value channel to the series belonging to the given indicator
     * type, so every line of a multi-value indicator can be colored on its own.
     *
     * Passing an empty array clears the overrides, so the series falls back to its palette colors.
     */
    public setSeriesColors(typeId: string, colors: (number | null)[]): void {
        let changed = false;

        for (const series of this.series) {
            const name = series.data?.indicator_info?.name;

            if (!name || Chart.stripIndicatorIndex(name) !== typeId)
                continue;

            series.setColorOverrides(colors);
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
            const valueIndex = values.length === 4 ? 3 : 0;
            const value = values[valueIndex];

            if (!Number.isFinite(value))
                continue;

            const info = series.data?.indicator_info;

            result.push({
                series,
                name: info?.name ?? '',
                valueTitle: Chart.getValueTitles(info?.name)[valueIndex] ?? '',
                value,
                // Price series are shifted by scrollY, so their last-price line must follow.
                worldY: this.priceToWorldY(value) + this.scrollY,
                // Use the color the value is actually drawn with, so the line matches the chart.
                color: series.getValueChannelColorNumber(valueIndex),
                dimFactor: series.dimFactor,
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
     * Smallest zoom level the chart can be zoomed out to. Zooming out shows more bars, so this
     * also caps how many bars can be visible at once.
     */
    public static readonly MIN_ZOOM: number = 1 / 8;

    /**
     * Largest zoom level the chart can be zoomed in to.
     */
    public static readonly MAX_ZOOM: number = 8;

    /**
     * Multiplier applied to the chart's zoom for one mouse-wheel notch. Fractional notches (e.g.
     * trackpads) scale the multiplier exponentially, so the zoom stays smooth.
     */
    public static readonly ZOOM_WHEEL_FACTOR: number = 1.2;

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
     *
     * The value is clamped to `MIN_ZOOM`..`MAX_ZOOM`, so callers do not have to guard against
     * zooming the chart out of existence.
     */
    public set zoom(value: number) {
        this._zoom = Chart.clampZoom(value);
        this.numBarsVisible = Math.max(1, Math.floor(this.numInitialBars / this._zoom));

        this.refreshSeriesData();
    }

    /**
     * Clamps the given zoom level to the range the chart supports.
     */
    public static clampZoom(zoom: number): number {
        if (!Number.isFinite(zoom))
            return 1;

        return Math.max(Chart.MIN_ZOOM, Math.min(zoom, Chart.MAX_ZOOM));
    }

    /**
     * World-space distance between two adjacent bars at the current zoom level.
     *
     * `scrollX` is measured in these units, so this is what converts a scroll offset into a
     * number of bars and back.
     */
    public get worldPerBar(): number {
        return this.barStep * this.zoom;
    }

    /**
     * Unzoomed world-space distance between two adjacent bars.
     *
     * This is the spacing `Series.layoutBars()` places the bars at, before the zoom factor is
     * applied, and it is what `scrollX` is expressed in.
     */
    public get barStep(): number {
        return this.barWidth + this.barSpacing;
    }

    /**
     * Zooms the chart by the given factor while keeping the bar under a horizontal position fixed
     * on screen.
     *
     * The anchor is what makes wheel zooming feel natural: the bar under the cursor stays under
     * the cursor instead of the chart growing around its centre.
     *
     * @param factor Multiplier applied to the current zoom. Values above 1 zoom in, below 1 zoom out.
     * @param anchorFraction Horizontal position inside the chart, 0 = left edge, 1 = right edge.
     */
    public zoomBy(factor: number, anchorFraction: number = 0.5): void {
        const previousZoom = this.zoom;
        const nextZoom = Chart.clampZoom(previousZoom * factor);

        if (nextZoom === previousZoom)
            return;

        const anchor = Number.isFinite(anchorFraction)
            ? Math.max(0, Math.min(anchorFraction, 1))
            : 0.5;

        // Fractional bar index currently under the anchor, in dataset coordinates. `scrollX` is
        // measured in on-screen bar widths, so it has to be divided by the *current* spacing.
        const anchorBar = this.scrollX / this.worldPerBar + anchor * this.numBarsVisible;

        this.zoom = nextZoom;

        // The visible window changed size, so the scroll offset has to be recomputed to put the
        // same bar back under the anchor. Snapping avoids a visible slide while the smooth
        // scroll interpolation catches up.
        this.scrollTo((anchorBar - anchor * this.numBarsVisible) * this.worldPerBar, this.targetScrollY, true);
    }

    private _domBarHover: HTMLElement = document.createElement('div');

    private positionBarHover = (event: MouseEvent): void => {
        this._domBarHover.style.left = `${event.pageX + 10}px`;
        this._domBarHover.style.top = `${event.pageY + 10}px`;
    };

    /**
     * Index of the bar slot (within the visible window) the mouse is currently hovering, or -1.
     *
     * A slot is shared by every series of the chart, so hovering a single bar reports the values of
     * *all* indicators at that bar rather than only the one under the cursor.
     */
    public hoveredBarIndex: number = -1;

    /**
     * Sets the hovered bar slot and highlights that bar in every series of the chart.
     *
     * Pass -1 to clear the hover state. The previous slot is cleared in the same pass, so moving
     * the cursor from one bar to the next never leaves a stale highlight behind.
     */
    public setHoveredBarIndex(index: number): void {
        const clamped = index >= 0 && index < this.numBarsVisible ? index : -1;

        if (this.hoveredBarIndex === clamped)
            return;

        const previous = this.hoveredBarIndex;
        this.hoveredBarIndex = clamped;

        this.applyHoverHighlight(previous, clamped);
    }

    /**
     * Applies the hover flag to the given bar slots of every series and refreshes their colors.
     *
     * Both the previously hovered and the newly hovered slot are handled in one pass, so a series
     * never keeps two highlighted bars.
     */
    private applyHoverHighlight(previous: number, current: number): void {
        for (const series of this.series) {
            for (const barIndex of [previous, current]) {
                if (barIndex < 0 || barIndex >= series.bars.length)
                    continue;

                const bar = series.bars[barIndex];

                if (!bar)
                    continue;

                bar.hovered = barIndex === current;
                series.updateBarColor(barIndex);
            }
        }

        this.updateHoverColumn();
    }

    /**
     * Drops every hover highlight, including the flags left on `Bar` objects that are reused
     * across datasets. Called when the data is replaced, where the old slot indices are meaningless.
     */
    private clearHoverHighlight(): void {
        this.hoveredBarIndex = -1;

        for (const series of this.series) {
            for (const bar of series.bars)
                bar.hovered = false;
        }

        this.updateHoverColumn();
    }

    /**
     * Vertical guide marking the hovered bar column across the whole chart.
     *
     * Candlestick series highlight the hovered bar through its own color, but line series have no
     * per-bar geometry, so a single chart-wide guide is what makes the hovered column visible for
     * every indicator at once.
     */
    private hoverColumnMesh: Gfx.Line | null = null;

    /** Material of `hoverColumnMesh`. */
    private hoverColumnMaterial: Gfx.LineBasicMaterial | null = null;

    /** Lazily creates the vertical guide used to mark the hovered bar column. */
    private ensureHoverColumn(): void {
        if (this.hoverColumnMesh)
            return;

        const geometry = new Gfx.BufferGeometry().setFromPoints([
            new Gfx.Vector3(0, 0, 0),
            new Gfx.Vector3(0, 1, 0),
        ]);

        this.hoverColumnMaterial = new Gfx.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.35,
            depthTest: false,
            depthWrite: false,
        });

        this.hoverColumnMesh = new Gfx.Line(geometry, this.hoverColumnMaterial);
        this.hoverColumnMesh.visible = false;
        this.hoverColumnMesh.renderOrder = 997;

        this.add(this.hoverColumnMesh);
    }

    /**
     * Positions and shows/hides the hovered-column guide.
     *
     * The guide spans the chart's full height and is placed at the hovered bar's X position, which
     * is the same for every series because they all share the chart's bar layout.
     */
    private updateHoverColumn(): void {
        if (this.hoveredBarIndex < 0) {
            if (this.hoverColumnMesh)
                this.hoverColumnMesh.visible = false;
            return;
        }

        // Every series shares the chart's bar layout, so any series that covers the hovered bar
        // can supply its X position. Series that start later (e.g. an MA) simply have no values
        // there, so the first one that does is used.
        let posX: number | null = null;
        let offsetX = 0;

        for (const series of this.series) {
            const bar = series.bars[this.hoveredBarIndex];

            if (!bar || bar.values.length === 0)
                continue;

            posX = bar.posX;
            offsetX = series.position.x;
            break;
        }

        if (posX === null) {
            if (this.hoverColumnMesh)
                this.hoverColumnMesh.visible = false;
            return;
        }

        this.ensureHoverColumn();

        // `bar.posX` is series-local, so the series' own offset (which carries the horizontal
        // scroll) has to be added to place the guide in chart space.
        this.hoverColumnMesh!.position.set(offsetX + posX, 0, 0);
        this.hoverColumnMesh!.scale.set(1, this.chartHeight, 1);
        this.hoverColumnMesh!.visible = true;
    }

    /**
     * Formats the values of a single bar for the hover tooltip.
     *
     * Price series use the chart's price precision and non-price indicators are shown with two
     * decimals. Every value is prefixed with its bolded title (e.g. "**Jaw** 1.2345"), taken from
     * the indicator's `valueTitles` in `AppStaticSettings`, so the values can be told apart, and
     * is drawn in the color of its own line so the tooltip matches the chart.
     */
    private formatBarValues(series: Series, values: number[]): string {
        const digits = series.isPriceSeries ? this.priceDigits : 2;
        const format = (value: number): string => Number.isFinite(value) ? value.toFixed(digits) : '—';
        const titles = Chart.getValueTitles(series.data?.indicator_info?.name);

        // Fallback for a four-value price series without configured titles (e.g. Heiken Ashi).
        const fallbackTitles = values.length === 4 && series.isPriceSeries
            ? ['O', 'H', 'L', 'C']
            : [];

        return values.map((value, index) => {
            const title = titles[index] ?? fallbackTitles[index];
            const color = Series.formatColor(series.getValueChannelColorNumber(index));
            const text = title
                ? `<b>${Chart.escapeHtml(title)}</b> ${format(value)}`
                : format(value);

            return `<span style="color:${color}">${text}</span>`;
        }).join(' ');
    }

    /**
     * Escapes text so indicator names can be embedded in the tooltip's markup safely.
     */
    private static escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Formats a bar timestamp (ms) as "D Mon YYYY HH:MM" for the hover tooltip.
     *
     * The timestamp is shifted back by one hour, matching the grid labels, because the stored
     * times are one hour ahead of the time the bars are meant to represent.
     */
    private static formatBarTime(timeMs: number): string {
        const date = new Date(timeMs - 60 * 60 * 1000);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');

        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} ${hours}:${minutes}`;
    }

    /** Last markup written to the hover tooltip, so the DOM is only touched when it changes. */
    private lastBarHoverHtml: string = '';

    /**
     * Horizontal rule separating the tooltip's timestamp header from the indicator values.
     *
     * Styled by `.chart-tooltip-separator` in `VCanvas3D.vue`, next to the tooltip's own styles.
     */
    private static readonly TOOLTIP_SEPARATOR: string = '<div class="chart-tooltip-separator"></div>';

    /**
     * Updates the labels on the chart, e.g. hover tooltips.
     *
     * The tooltip lists the values of every visible indicator at the hovered bar, one indicator per
     * line, so a single hover reports the whole chart's state instead of just the series under the
     * cursor.
     */
    public updateLabels(): void {
        if (!this._domBarHover.parentElement) {
            this._domBarHover.classList.add('chart-tooltip');
            document.body.appendChild(this._domBarHover);
            document.addEventListener('mousemove', this.positionBarHover);
        }

        const lines: string[] = [];
        let timeMs = 0;

        if (this.hoveredBarIndex >= 0) {
            for (const series of this.series) {
                // Hidden indicators are not drawn, so they must not be reported either.
                if (!series.visible)
                    continue;

                const bar = series.bars[this.hoveredBarIndex];

                if (!bar || bar.values.length === 0)
                    continue;

                if (timeMs === 0 && bar.time_ms > 0)
                    timeMs = bar.time_ms;

                const name = this.getIndicatorDisplayName(series.data?.indicator_info?.name) || 'Series';
                const color = Series.formatColor(series.color);

                lines.push(
                    `<span style="color:${color}">${Chart.escapeHtml(name)}</span>: ${this.formatBarValues(series, bar.values)}`
                );
            }
        }

        const isHovering = lines.length > 0;

        this._domBarHover.style.display = isHovering ? 'block' : 'none';

        if (!isHovering) {
            this.lastBarHoverHtml = '';
            return;
        }

        // The timestamp header is separated from the values by a horizontal rule, so the header
        // does not read as just another indicator line.
        const header = timeMs > 0
            ? `${Chart.formatBarTime(timeMs)}${Chart.TOOLTIP_SEPARATOR}`
            : '';

        const html = header + lines.join('<br>');

        if (html !== this.lastBarHoverHtml) {
            this._domBarHover.innerHTML = html;
            this.lastBarHoverHtml = html;
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
     * @param timeframe Time-frame the chart's bars are built on, as an `ENUM_TIMEFRAMES` value
     * (i.e. `lib.timeframes[id]`). Indicators may run on other time-frames, so this is what
     * decides which series provides the chart's bar grid. When omitted, the longest series is
     * used, which is what a chart whose indicators all share one time-frame wants.
     */
    public setData(data: TesterValuesColumns[] | null, timeframe?: number): void {
        this.data = data;
        this.cachedOHLC = null;
        this.invalidatedBBox = true;

        // The bars are rebuilt below, so any hovered slot from the previous dataset is meaningless.
        // Clearing it also drops the highlight flags on the reused Bar objects.
        this.clearHoverHighlight();
        this.lastBarHoverHtml = '';

        // Bring the wasm value order in line with the renderer's before anything reads the data.
        if (this.data) {
            for (const seriesData of this.data)
                Chart.normalizeSeriesData(seriesData);
        }

        // The timeline maps timestamps onto dataset indices; it must exist before any series is
        // windowed or laid out.
        this.buildTimeline(timeframe);

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
        
        //this.scrollTo(0, 0); // Refresh the chart to reflect the new data.
        this.onDataSet?.();
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
     * Index permutation converting the wasm OHLC value order into the renderer's order.
     *
     * The wasm `Indi_OHLC` indicator emits one value per `ENUM_INDI_OHLC_MODE` entry, and that
     * enum is ordered `CLOSE = 0, OPEN = 1, HIGH = 2, LOW = 3` (see `Indi_OHLC.mqh`). The whole
     * renderer, on the other hand, expects the conventional `[open, high, low, close]` order, so
     * the values have to be permuted once, as soon as they enter the front-end.
     */
    private static readonly WASM_OHLC_ORDER: readonly number[] = [1, 2, 3, 0];

    /**
     * Reorders the values of an OHLC indicator entry from the wasm order
     * (`[close, open, high, low]`) into the renderer's order (`[open, high, low, close]`).
     *
     * Only the `OHLC` indicator is reordered: other indicators that happen to return four values
     * (e.g. Heiken Ashi) already use the conventional order, and indicators with any other number
     * of values are passed through untouched.
     *
     * @param indicatorName The `indicator_info.name` of the series the values belong to.
     * @param values The raw values of a single entry.
     * @returns The values in `[open, high, low, close]` order, or `values` unchanged.
     */
    public static normalizeEntryValues(indicatorName: string | undefined, values: number[]): number[] {
        if (values.length !== 4 || !indicatorName)
            return values;

        if (Chart.stripIndicatorIndex(indicatorName) !== 'OHLC')
            return values;

        return Chart.WASM_OHLC_ORDER.map(index => values[index]);
    }

    /**
     * Series data whose entries have already been reordered by `normalizeSeriesData()`.
     *
     * Reordering is done in place, so it must never run twice on the same data — otherwise the
     * values would be permuted back into the wasm order.
     */
    private static readonly normalizedSeriesData: WeakSet<TesterValuesColumns> = new WeakSet();

    /**
     * Reorders every entry of the given series data into the renderer's value order.
     *
     * Safe to call repeatedly: data that has already been normalized is skipped.
     */
    private static normalizeSeriesData(seriesData: TesterValuesColumns): void {
        if (Chart.normalizedSeriesData.has(seriesData))
            return;

        Chart.normalizedSeriesData.add(seriesData);

        const name = seriesData.indicator_info?.name;

        for (const entry of seriesData.values) {
            const values = Chart.entryValues(entry);

            if (values.length !== 4)
                continue;

            const normalized = Chart.normalizeEntryValues(name, values);

            if (normalized === values)
                continue;

            // The wasm layer hands us a plain JS array, so it can be rewritten in place.
            for (let i = 0; i < normalized.length; i++)
                values[i] = normalized[i];
        }
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

        // All arithmetic is done in integer points (1 point = 10^-digits) to avoid float noise.
        const unit = Math.pow(10, digits);
        const numLines = this.maxHorizontalLines;

        const upperPts = Math.ceil(max * unit - 1e-6);
        const lowerPts = Math.floor(min * unit + 1e-6);

        // Lines are anchored at the whole-unit price below the data (e.g. 1.00000), so steps such as
        // 15 points give 1.00015, 1.00030, ...
        const anchorPts = Math.floor(lowerPts / unit) * unit;

        const diffPts = Math.max(upperPts - lowerPts, numLines);

        let step = 1;
        let alignedLowerPts = lowerPts;

        // Smallest human-friendly step that keeps the whole data range inside the window.
        for (const candidate of Chart.niceStepsInPoints(Math.ceil(diffPts / numLines))) {
            const lowerAligned = anchorPts + Math.floor((lowerPts - anchorPts) / candidate) * candidate;

            step = candidate;
            alignedLowerPts = lowerAligned;

            if (lowerAligned + candidate * numLines >= upperPts)
                break;
        }

        this.priceStep = step / unit;
        this.priceMin = alignedLowerPts / unit;
        this.priceMax = (alignedLowerPts + step * numLines) / unit;
    }

    /**
     * Yields integer step sizes (in points) that read well as price differences: 1, 2, 5, 10, 15,
     * 20, 25, 50, 100, 150, ... — never smaller than `minPoints`.
     */
    private static *niceStepsInPoints(minPoints: number): Generator<number> {
        const mantissas = [1, 1.5, 2, 2.5, 5];

        for (let power = 1; power < 1e15; power *= 10) {
            for (const mantissa of mantissas) {
                const value = mantissa * power;

                if (Number.isInteger(value) && value >= minPoints)
                    yield value;
            }
        }
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
     * Number of bars covered by the dataset.
     *
     * The count comes from the timeline, i.e. from the series running on the chart's own
     * time-frame. Series have different lengths: an MA only produces values once it has enough
     * history, so it starts later than the OHLC series, and an indicator that overrides the
     * time-frame may have far more (or fewer) entries than the chart has bars. Neither can be used
     * as the chart-wide bar count or as the baseline for scrolling and windowing.
     */
    public getNumBars(): number {
        if (this.timeline)
            return this.timeline.length;

        if (this.data)
            return Chart.getDataLength(this.data);

        if (this.series.length === 0)
            return 0;

        return this.series[0].bars.length;
    }

    /**
     * Number of entries in the longest series of the given dataset.
     */
    public static getDataLength(data: TesterValuesColumns[] | null): number {
        let length = 0;

        for (const seriesData of data ?? []) {
            const seriesLength = seriesData.values?.length ?? 0;

            if (seriesLength > length)
                length = seriesLength;
        }

        return length;
    }

    /**
     * The dataset index of the entry a given series row belongs to, or -1 when the row's timestamp
     * is not part of the timeline.
     *
     * Rows are positioned by timestamp rather than by array offset: an MA series starts later than
     * the OHLC series, so its row 0 must land on the bar it actually belongs to.
     */
    public datasetIndexFor(seriesData: TesterValuesColumns, rowIndex: number): number {
        const row = seriesData.values?.[rowIndex];

        if (!row || !this.timeline)
            return -1;

        const timeMs = Number(row.timestamp) * 1000;

        if (!Number.isFinite(timeMs))
            return -1;

        const index = Chart.binarySearchTime(this.timeline, timeMs);

        if (index >= 0)
            return index;

        // Timestamp sits between two bars — snap it to the nearest one.
        const insertionPoint = ~index;

        if (insertionPoint === 0)
            return 0;

        if (insertionPoint >= this.timeline.length)
            return this.timeline.length - 1;

        const before = this.timeline[insertionPoint - 1];
        const after = this.timeline[insertionPoint];

        return timeMs - before <= after - timeMs ? insertionPoint - 1 : insertionPoint;
    }

    /**
     * Finds `timeMs` in a sorted array of timestamps.
     *
     * @returns The index of the matching entry, or `-(insertionPoint) - 1` when absent.
     */
    private static binarySearchTime(times: number[], timeMs: number): number {
        let low = 0;
        let high = times.length - 1;

        while (low <= high) {
            const mid = (low + high) >> 1;
            const value = times[mid];

            if (value === timeMs)
                return mid;

            if (value < timeMs)
                low = mid + 1;
            else
                high = mid - 1;
        }

        return -(low) - 1;
    }

    /**
     * Timestamp (ms) of the dataset bar at the given dataset index, or 0 when unknown.
     */
    public timeAtIndex(datasetIndex: number): number {
        return this.timeline && datasetIndex >= 0 && datasetIndex < this.timeline.length
            ? this.timeline[datasetIndex]
            : 0;
    }

    /**
     * Duration of one bar in ms (the smallest real gap in the timeline, so weekend gaps are
     * ignored), or 0 when unknown.
     */
    public get barDurationMs(): number {
        if (this._barDurationMs !== null)
            return this._barDurationMs;

        const times = this.timeline;

        if (!times || times.length < 2)
            return 0;

        let min = Infinity;

        for (let i = 1; i < Math.min(times.length, 500); i++) {
            const diff = times[i] - times[i - 1];

            if (diff >= 1000 && diff < min)
                min = diff;
        }

        this._barDurationMs = Number.isFinite(min) ? min : 0;

        return this._barDurationMs;
    }

    private _barDurationMs: number | null = null;

    /**
     * Converts a timestamp (ms) into a fractional dataset index. Times outside the data are
     * extrapolated using the bar duration, so they may be negative or past the last bar.
     * Returns null when there is no timeline.
     */
    public fractionalIndexAtTime(timeMs: number): number | null {
        const times = this.timeline;
        const barMs = this.barDurationMs;

        if (!times || times.length === 0 || barMs <= 0)
            return null;

        const last = times.length - 1;

        if (timeMs <= times[0])
            return (timeMs - times[0]) / barMs;

        if (timeMs >= times[last])
            return last + (timeMs - times[last]) / barMs;

        let low = 0;
        let high = last;

        // Invariant: times[low] <= timeMs < times[high].
        while (high - low > 1) {
            const mid = (low + high) >> 1;

            if (times[mid] <= timeMs)
                low = mid;
            else
                high = mid;
        }

        return low + (timeMs - times[low]) / (times[high] - times[low]);
    }

    /**
     * Converts a fractional dataset index into a timestamp (ms), extrapolating outside the data.
     * Returns null when there is no timeline.
     */
    public timeAtFractionalIndex(index: number): number | null {
        const times = this.timeline;
        const barMs = this.barDurationMs;

        if (!times || times.length === 0 || barMs <= 0)
            return null;

        const last = times.length - 1;

        if (index <= 0)
            return times[0] + index * barMs;

        if (index >= last)
            return times[last] + (index - last) * barMs;

        const low = Math.floor(index);

        return times[low] + (index - low) * (times[low + 1] - times[low]);
    }

    /**
     * Returns the window of dataset indices to show: `[startIndex, endIndexExclusive)`.
     *
     * The scroll position is expressed in bars of the timeline, so the window is simply the slice
     * of the longest series. Series that do not cover a bar simply have no data there.
     */
    public getDataWindow(): [number, number] {
        const total = this.getNumBars();
        const numBars = Math.max(0, this.numBarsVisible);
        const start = Math.max(0, Math.min(this.startIndex, total));

        return [start, Math.min(start + numBars, total)];
    }

    /**
     * Timestamp (ms) of every dataset index, built from the series that defines the chart's bars.
     *
     * The anchor is the series running on the chart's own time-frame, because that is what the
     * bars represent. Indicators may override the time-frame, so a finer one (e.g. an M1 MA on an
     * H1 chart) would otherwise provide far more entries than the chart has bars. When no series
     * matches the chart's time-frame, the longest series is used — that is the one covering the
     * whole history, since shorter ones (e.g. an MA, which needs `period` bars before its first
     * value) start later and would place the timeline at the wrong offset.
     */
    private timeline: number[] | null = null;

    /**
     * Rebuilds the timeline from the dataset. Called whenever new data is set.
     *
     * @param timeframe Time-frame of the chart's bars, as an `ENUM_TIMEFRAMES` value, or
     * `undefined` to anchor the timeline on the longest series.
     */
    private buildTimeline(timeframe?: number): void {
        this.timeline = null;
        this._barDurationMs = null;

        if (!this.data || this.data.length === 0)
            return;

        let anchor: TesterValuesColumns | null = null;

        if (timeframe !== undefined) {
            for (const seriesData of this.data) {
                if (seriesData.indicator_info?.tf !== timeframe)
                    continue;

                if ((seriesData.values?.length ?? 0) === 0)
                    continue;

                if (!anchor || (seriesData.values?.length ?? 0) > (anchor.values?.length ?? 0))
                    anchor = seriesData;
            }
        }

        if (!anchor) {
            for (const seriesData of this.data) {
                const length = seriesData.values?.length ?? 0;

                if (length === 0)
                    continue;

                if (!anchor || length > (anchor.values?.length ?? 0))
                    anchor = seriesData;
            }
        }

        if (!anchor)
            return;

        const times: number[] = [];

        for (const entry of anchor.values) {
            const timeMs = Number(entry.timestamp) * 1000;

            times.push(Number.isFinite(timeMs) ? timeMs : 0);
        }

        // A timeline must be strictly increasing for the binary search to work.
        for (let i = 1; i < times.length; i++) {
            if (times[i] <= times[i - 1])
                times[i] = times[i - 1] + 1;
        }

        this.timeline = times;
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

        // Horizontal extent — chart is centered at x=0 so bars and grid lines align. The width is
        // derived from the *initial* bar count, so it does not change when the chart is zoomed:
        // zooming only changes how many bars fit into the same world-space width.
        const chartWidth = this.numInitialBars * (this.barWidth + this.barSpacing);
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
     * @param snap When true the current scroll position jumps to the target immediately instead of
     * being interpolated towards it. Used by zooming, where a lagging scroll would make the chart
     * slide after the zoom has already been applied.
     */
    public scrollTo(x: number, y: number = 0, snap: boolean = false): void {
        this.targetScrollX = Math.max(0, Math.min(x, this.getMaxScrollX()));
        this.targetScrollY = y;

        if (snap) {
            this.scrollX = this.targetScrollX;
            this.scrollY = this.targetScrollY;
        }
    }

    private static readonly TRAILING_BARS = 2;

    private getMaxScrollX(): number {
        const dataLength = this.getNumBars();
        // Bars are placed at (index + 1) steps and fade out at the right edge, so the last bar would
        // sit exactly on the edge and be invisible. Allow scrolling a couple of bars past the data.
        const maxStartIndex = Math.max(0, dataLength - this.numBarsVisible + Chart.TRAILING_BARS);

        return maxStartIndex * this.worldPerBar;
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
        let barIndex = Math.floor(this.scrollX / this.worldPerBar);

        this.startIndex = barIndex;

        let shiftedPositionX = this.scrollX % this.worldPerBar;

        for (const series of this.series) {
            series.position.x = -this.chartWidth / 2 - shiftedPositionX;
            // Only price series follow the vertical scroll — non-price indicators (e.g. 0..100)
            // keep a static vertical position so they never leave the chart.
            series.position.y = series.isPriceSeries ? this.targetScrollY : 0;
        }

        // The hovered-column guide is positioned from the series offset, so it has to follow the
        // scroll as well.
        this.updateHoverColumn();

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