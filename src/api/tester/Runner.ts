import { Test, run, LibModule } from 'fx31337-wasm/lib/Runner';
import { type Chart } from '../rendering/objects/Chart';
import { AppRoamingStateChart } from '../data/AppRoamingState';
// @ts-ignore
import createModule from 'fx31337-wasm/dist/IndicatorTest.js';
import { TesterValues } from 'fx31337-wasm/lib/types/TesterValues';
import { AppStaticSettings } from '../data/AppStaticSettings';
import { IndicatorBase } from 'fx31337-wasm/lib/types/Indicators/IndicatorBase';
import { ENUM_IDATA_VALUE_RANGE_ToString } from 'fx31337-wasm/lib/types/enums/ENUM_IDATA_VALUE_RANGE';
import { ENUM_DATATYPE_ToString } from 'fx31337-wasm/lib/types/enums/ENUM_DATATYPE';

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

    /**
     * Runs the test using the specified library module.
     * @param lib The library module to be used for running the test.
     */
    async run(lib: LibModule): Promise<any> {
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
            const ticker = track(new lib.indicators.TickProvider({ symbol: 'EURUSD' }));

            lib.Tester.Reset();

            const tfM1 = track(new lib.indicators.Tf(lib.timeframes.M1));
            tfM1.SetSource(ticker);

            this.chartConfig.indicators.forEach(indicatorConfig => {
                const indicatorFactory = AppStaticSettings.indicators.find(ind => ind.typeId === indicatorConfig.typeId)?.factory;
                const indicator = track((indicatorFactory!)(lib, indicatorConfig.config));
                indicator.SetName(indicatorConfig.typeId);
                indicator.SetSource(tfM1);
                lib.Tester.Add(indicator);
            });

            lib.Tester.FeedTickProvider(ticker);

            // Process all ticks through the indicator pipeline.
            lib.Tester.RunAllTicks();


            // Retrieve all ungrouped (raw, bar-by-bar) indicator values.
            // Passing 0n for both parameters means: all available history, up to most recent bar.
            const testerValues = lib.Tester.GetValues(BigInt(0), BigInt(0), 0, false);

            for (const indicator of testerValues?.timestep_based) {
                console.log(`Indicator: ${indicator.indicator_info.name}, Symbol: ${indicator.indicator_info.symbol}, Symbol Digits: ${indicator.indicator_info.symbol_digits}, Data Type: ${ENUM_DATATYPE_ToString(indicator.indicator_info.data_type)}, Value Range: ${ENUM_IDATA_VALUE_RANGE_ToString(indicator.indicator_info.value_range)}, Color: ${indicator.indicator_info.color}, Values:`, indicator.values);
            }

            this.chart.setData(testerValues?.timestep_based);
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

    public async test() {
        await run(Runner, createModule, 'node_modules/fx31337-wasm/dist/IndicatorTest.wasm', this);
    }
}