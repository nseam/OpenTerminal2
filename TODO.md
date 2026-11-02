# Visualization (Front-end, Vue)

- Storing roaming data in the browser (app settings like list of indicators for each chart and configuration for each indicator).
- Uploading of tick data into the browser's roaming storage
- Configuration for each chart in which we can select already uploaded tick data and time-frame used for bars
- Building Chart's Series objects from the configured list of indicators
- Stacking Chart objects horizontally in the scene
- Reordering of Chart objects in the charts configuration panel
- Centering camera over the selected chart
- Adding indicator settings for all the indicators exported from Emscripten
- Orthogonal camera projection switch

# Back-end (C++)

- Reseting list of added indicators in Platform class
- Emscripten exports for all indicators


# Prompts

## Indicator exports and configuration

Currently we can add an RSI indicator to the chart and configure it. The RSI indicator is taken from the `/home/mx/ea/fx/FX31337-wasm/src/classes/Indicators/` folder where it is exported via Emscripten. Additionally, the FX31337-wasm exports a Indi_RSI.ts file that specifies what has been exported from Emscripten. We made sure the parameters exported are the same as in C++'s `Indi_RSI.h` file. After that, we defined configuration of the RSI indicator that can be added in the chart inside `AppStaticSettings.ts`. We made sure that default parameters are the same as default parameters to the RSI. Also the factory method creates an instance of the Emscripten-exported RSI indicator with the proper parameters. After that, we created VRSIConfig.vue component that allowed us to configure the indicator in the UI side.

Now please do the same for the MA indicator. Implement missing Emscripten exports in the `/home/mx/ea/fx/FX31337-wasm/src/classes/Indicators/` folder for the MA indicator (in the C++ header file), missing typescript class and parameters exports in the `/home/mx/ea/fx/FX31337-wasm/lib/types/Indicators` folder, `AppStaticSettings.ts` configuration and component to configure it inside `src/components/data/indicators` folder.


## Fixed chart height.

Currently we calculate Chart's height using bounding box minimum and maximum values which is calculated from the minimum and maximum values of the Chart's bars. We need to make following changes:
- The chart's height will be fixed, so `Chart.chartHeight` getter should return fixed value, e.g. `1.0`.
- Now, `TesterIndicatorInfo` struct that is a part of returned object by `Tester.GetValues(...)` methods contain additional information about the indicator. There is a `value_range` field that is of enum type `ENUM_IDATA_VALUE_RANGE`. We will use that value range in order do check if the given indicator is a price indicator or not. Price indicators are those that have values: `IDATA_RANGE_PRICE`, `IDATA_RANGE_PRICE_DIFF`, `IDATA_RANGE_PRICE_ON_SIGNAL`.
- There will be exactly 20 horizontal lines. We will store that number in the `Chart.maxHorizontalLines` field.
- Now, we will calculate the difference between minmum and maximum value for price indicators. Then we will determine the highest price rounded up to the indicator's `symbol_digits`. We also do that with the lowest price, rounded down. Note that we will calculate the minimum and maximum prices only initially, when the `Chart.setData()` is called. When user will scroll the chart left/right that he will also need to move chart vertically to see other prices that are above/beyound intial price window. After we determined the rounded highest and lowest prices, we will need to make some adjustments for that prices:
  - We will determine the first price indicator's `symbol_digits` and use it as the precision of all prices on the chart, because one chart displays only a single symbol.

Example of how the horizontal lines placement should work:
  - There will be 20 horizontal lines.
  - Upper price after rounding up: 1.19085
  - Lower price after rounding down: 1.16775
  - Absolute price difference = 0.02310
  - Number of horizontal lines: 20, now we divide the price difference by number of horizontal lines. Result is `0.02310/20 = 0.001155`.
  - Because `symbol_digits` for the first price indicator is `5` that means that our price precision is `0.00001`.
  - Price step was calculated as `0.001155`. If the price step precision is larger than symbol's precision then we round up the price step with the symbols precision, i.e. we will convert `0.001155` into `0.00116`.
  - Now we need to adjust our initially calculated upper and lower price by rounding it up/down via calculated price step. That would mean that each horizontal line will have the same price difference between another line.

For all other indicators, let them be drawn as they are 0-100 i.e. 0% - 100% indicators, so they just don't expand vertically on the chart beyond the chart. They need to have static vertical position and not be scrolled vertically. Then value 0 means that it's bar/line/point should be at the bottom of the chart grid and value 100 should be at the top of the chart. We will change that rule later, because there could be indicators returning other ranges of values.

Ensure that for non-price indicators, 