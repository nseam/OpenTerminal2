import { Test, run, LibModule } from 'fx31337-wasm/lib/Runner';
import { type Chart } from '../rendering/objects/Chart';
import { AppRoamingStateChart } from '../data/AppRoamingState';
// @ts-ignore
import createModule from 'fx31337-wasm/dist/IndicatorTest.js';
import { TesterValues } from 'fx31337-wasm/lib/types/TesterValues';
import { AppStaticSettings } from '../data/AppStaticSettings';
import { IndicatorBase } from 'fx31337-wasm/lib/types/Indicators/IndicatorBase';
import { type Indi_TickProvider } from 'fx31337-wasm/lib/types/Indicators/Indi_TickProvider';
import { type IndicatorTf } from 'fx31337-wasm/lib/types/Indicators/IndicatorTf';
import { ENUM_IDATA_VALUE_RANGE_ToString } from 'fx31337-wasm/lib/types/enums/ENUM_IDATA_VALUE_RANGE';
import { ENUM_DATATYPE_ToString } from 'fx31337-wasm/lib/types/enums/ENUM_DATATYPE';
import { opfs, type OPFSFile } from '../OPFS';
import { NotFound } from '../Throwables';
import { normalizeAppTimeframe, resolveAppTimeframe } from '../data/AppTimeframes';

export class Runner extends Test {

    /**
     * The chart instance used by the runner.
     */
    public chart: Chart;

    /**
     * The chart configuration used by the runner.
     */
    public chartConfig: AppRoamingStateChart;

    /**
     * Constructs a new Runner instance with the specified chart.
     * @param chart The chart instance to be used by the runner.
     */
    public constructor(chart: Chart, chartConfig: AppRoamingStateChart) {
        super();

        this.chart = chart;
        this.chartConfig = chartConfig;
    }

    /** Promise of the run started by the library, which does not await it. */
    private pendingRun?: Promise<any>;

    /**
     * Starts the run using the specified library module.
     * @param lib The library module to be used for running the test.
     */
    run(lib: LibModule): Promise<any> {
        this.pendingRun = this.execute(lib);

        return this.pendingRun;
    }

    private async execute(lib: LibModule): Promise<any> {
        lib.Tester.Init();

        // Embind objects own C++ instances that must be released explicitly, otherwise Embind
        // reports a leak and only reclaims the memory through its unreliable fallback.
        //
        // Order matters: the indicators are still referenced by the platform, so releasing our
        // handles first only drops our reference and leaves the objects alive. Releasing them
        // after `Tester.Reset()` would be a double free, because Reset already destroyed them.
        const allocated: { delete(): void; isDeleted?(): boolean }[] = [];

        const track = <T extends { delete(): void; isDeleted?(): boolean }>(object: T): T => {
            allocated.push(object);
            return object;
        };

        try {
            const tickSource = this.chartConfig.tickSource;
            const symbol = tickSource?.symbol || 'EURUSD';

            const ticker = track(new lib.indicators.TickProvider({ symbol }));

            lib.Tester.Reset();

            // One candle indicator per time-frame, shared by every indicator that runs on it.
            // All of them are fed by the same tick provider, so the ticks are aggregated into
            // bars of each time-frame independently.
            const timeframes = new Map<string, IndicatorTf>();

            const getTimeframe = (id: string): IndicatorTf => {
                const normalized = normalizeAppTimeframe(id);
                const existing = timeframes.get(normalized);

                if (existing)
                    return existing;

                const timeframe = track(new lib.indicators.Tf(lib.timeframes[normalized as keyof typeof lib.timeframes]));
                timeframe.SetSource(ticker);
                timeframes.set(normalized, timeframe);

                return timeframe;
            };

            this.chartConfig.indicators.forEach(indicatorConfig => {
                const indicatorType = AppStaticSettings.indicators.find(ind => ind.typeId === indicatorConfig.typeId);
                const indicatorFactory = indicatorType?.factory;

                // Cleared number inputs and stale saved configs leave null/undefined values, which the WASM constructors reject.
                const config: Record<string, unknown> = { ...indicatorConfig.config };
                for (const [key, fallback] of Object.entries(indicatorType?.defaultConfig ?? {})) {
                    if (config[key] === null || config[key] === undefined)
                        config[key] = fallback;
                }

                // An indicator without its own time-frame follows the chart ("Same as chart").
                const indicatorTimeframe = resolveAppTimeframe(this.chartConfig.timeframe, indicatorConfig.timeframe);

                const indicator = track((indicatorFactory!)(lib, config));
                indicator.SetName(indicatorConfig.typeId);
                indicator.SetSource(getTimeframe(indicatorTimeframe));
                lib.Tester.Add(indicator);
            });

            await this.feedTicks(lib, ticker, tickSource?.path);

            // Process all ticks through the indicator pipeline.
            lib.Tester.RunAllTicks();


            // Retrieve all ungrouped (raw, bar-by-bar) indicator values.
            // Passing 0n for both parameters means: all available history, up to most recent bar.
            const testerValues = lib.Tester.GetValues(BigInt(0), BigInt(0), 0, false);

            for (const indicator of testerValues?.timestep_based) {
                console.log(`Indicator: ${indicator.indicator_info.name}, Symbol: ${indicator.indicator_info.symbol}, Symbol Digits: ${indicator.indicator_info.symbol_digits}, Time-frame: ${indicator.indicator_info.tf}, Data Type: ${ENUM_DATATYPE_ToString(indicator.indicator_info.data_type)}, Value Range: ${ENUM_IDATA_VALUE_RANGE_ToString(indicator.indicator_info.value_range)}, Color: ${indicator.indicator_info.color}, Values:`, indicator.values);
            }

            // The chart's bars are built on its own time-frame, even when some indicators override
            // it, so the timeline is anchored on the series running on that time-frame.
            this.chart.setData(testerValues?.timestep_based, lib.timeframes[normalizeAppTimeframe(this.chartConfig.timeframe) as keyof typeof lib.timeframes]);
        }
        finally {
            // Release our handles in creation order, then let the platform drop its own references.
            // The values returned by GetValues() are plain JS objects, so they stay valid.
            for (const object of allocated) {
                try {
                    if (object.isDeleted?.() !== true)
                        object.delete();
                }
                catch (error) {
                    console.warn('Failed to release a wasm indicator instance.', error);
                }
            }

            lib.Tester.Reset();
        }
    }

    /**
     * Feeds the tick provider with the ticks the chart is configured to use.
     *
     * When the chart has a tick source, every CSV file stored in its OPFS folder is parsed by
     * `Tester.FeedTickProviderCsv()`. Otherwise the wasm module generates randomized ticks, so a
     * chart still renders before any tick data has been uploaded.
     */
    private async feedTicks(lib: LibModule, ticker: Indi_TickProvider, path?: string): Promise<void> {
        const files = path ? await this.listTickFiles(path) : [];

        if (files.length === 0) {
            lib.Tester.FeedTickProvider(ticker, 1000);

            return;
        }

        for (const file of files) {
            lib.Tester.FeedTickProviderCsv(ticker, await file.file.text());
        }
    }

    /**
     * Lists the CSV files of a tick source folder, sorted by name.
     *
     * The upload panel stores one file per hour, so sorting by name feeds the ticks in
     * chronological order.
     */
    private async listTickFiles(path: string): Promise<OPFSFile[]> {
        try {
            const files = await opfs.listFiles(path);

            return files
                .filter(file => file.extension.toLowerCase() === 'csv')
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        catch (error) {
            if (error instanceof NotFound) {
                console.warn(`Tick source folder "${path}" does not exist, falling back to randomized ticks.`);

                return [];
            }

            throw error;
        }
    }

    public async test() {
        this.pendingRun = undefined;

        await run(Runner, createModule, 'node_modules/fx31337-wasm/dist/IndicatorTest.wasm', this);
        await this.pendingRun;
    }
}