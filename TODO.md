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

Ensure that for non-price indicators...



## Origin Private File System (OPFS)

Please create an Origin Private File System (OPFS) wrapper class in the `src/api/OPFS.ts` file that will be able to:

- Retrieve list of stored files in the path via `async listFiles(path: string, recursively: boolean = false): OPFSFile`. Result should be a list of objects of type `OPFSFile`. The method should allow for recursive retrieval of files at the given path. `OPFSFile` should be containing of:
  * Standard OPFS's `File` object named `file`.
  * Full file path named `fullPath`.
  * Name of the file without extension and parent path named `fileNameWithoutExtension`
  * An extension of the file named `extension`
  * Size in bytes of the stored file named `size`
  * Date of the creation/modification of the stored file in an object of type `Date` named `date`
- Read a file by the full path where first segment of a full path of the file, e.g. `async getFile(path: string): File`. It should returns standard OPFS's `File` object.
- Store a file at the given path via `async storeFile(path: string, data: string|ArrayBuffer)`. The file should be stored where the data could be a string or binary data to be stored.
- Remove a folder recursively at the given path via `async removeFolder(path: string)`,
- Remove a file at the given path via `async removeFile(path: string)`.
- Check the used disk space in bytes via `async getDiskUsed()` method.
- Check the remaining disk space in bytes via `async getDiskFree()` method.

Each method should throw an extension in case of failure, e.g., `NotFound`, `AccessDenied`, `Unexpected`, `ConnectionError` from `src/api/Throwables.ts` file. If there should be another type of exception then add one at it in the `src/api/Throwables.ts` file.



## OPFS File System Explorer.

Create an OPFS file system explorer Vue component like Midnight Commander in which I can explore the tree of files saved in the browser.

Add the component to the `VApp`'s component under the Chart and indicator's configuration list.

t


## Uploading Ticks data into OPFS

We need a way to provide tick data for the `Runner` class that is used to test Charts. Currently we use a randomized tick data as in `Runner.ts` file like following: `lib.Tester.FeedTickProvider(ticker);`. That line uses `Tester` class exported via emscripten from the `/home/mx/kenorb/FX31337-wasm` project. The idea is to have `void Tester::FeedTickProviderWithCsv(string data)` method in `FX31337-wasm` project and export it it via emscripten. Let that method use tick data from the given CSV string data delimited by comma. An example of the CSV ticks data file is at `/home/mx/kenorb/fx/FX31337-wasm/tests/data/2022-01-03--00h_ticks.csv` file. The idea is that we use `OPFS` class that manages roaming app big data files to upload ticks data into browser's OPFS storage. Ticks will be uploaded in the path `ticks/USER_SPECIFIED_NAME/USER_SELECTED_SYMBOL`. User will be able to specify name for the folder under `ticks` folder and input a symbol name e.g., `EURUSD`, `EURPLN`. We need a dedicated Vue component in the `src/components/data/VTicksUpload.vue` file that will have such Element Plus widgets:
- Name of the sub folder under `ticks` to store the data. This will be the `ElInput` widget.
- Symbol name that is an `ElInput` widget so user could type symbol name
- An upload widget `ElUpload` where we can attach multiple files.
- A button (`ElButton` widget) with title "Upload" that will store files in the OPFS browser's storage.
When users clicks the `Upload` button then there should be a progress bar at the top of the page with fixed positioning and height of 10px with an animation. If possible, the progress bar should show the percentage progress of the upload.
This is an example of user input and final file names to save to:
- Name: `Forex`
- Symbol Name: `EURUSD`
- Files attached: `2022-01-03--00h_ticks.csv`, `2022-01-03--01h_ticks.csv`
Final file paths for `OPFS.storeFile()` method:
`ticks/Forex/EURUSD/2022-01-03--00h_ticks.csv`, `2022-01-03--01h_ticks.csv`
After the files are uploaded, we need to refresh VOPFSExplorer widget in the `VApp` component.
Let the `VTicksUpload` component be above the `VOPFSExplorer` component inside `VApp` component.


## Passing tick data for chart run.

From the UI-side we need to provide the user a way to select tick files he wants to be used for Chart run. The tick files were uploaded by the user using `VOPFSExplorer` Vue component and stored in the browser's OPFS storage. 

## Chart OHLC bars display

### Wrong OHLC indicator bars' width

Look like when only OHLC indicator is added to the chart, then its bars aren't displayed, only its bar lines are displayed, which is wrong. [image pasted]

### Wrong OHLC indicator bars' lines positioning and height.

As you can see the bars of OHLC indicator aren't properly displayed. Looks like their Opening value doesn't correspond with Closing value of the previous bar. Also their High/Low line is not properly positioned and have wrong height. That could have something with the previous problem [image pasted]

### MA indicator problem with reversed values

When OHLC and MA indicator is added onto the chart then we can see that MA indicator is draw in reverse, which is wrong. I think it worked correctly in the past.

## Universal indicator drawing problem.

Universal indicator has straight line despite its values are close to the OHLC values. That is wrong. It worked correctly in the past.

## UI Changes: Right panel tabs

Currently, on the right side of the app there is a container containing List of charts and its indicators, underneath is "Upload Ticks" widget and underneath is "OPFS File Manager". Let create a list of tabs using ElElements widgets so each of those parts will have its own tab and user will be able to switch between those three parts.

## Envelopes indicator WASM error.

Check why Envelopes indicator fails to execute on the WASM side. This is an error:

```
14:53:20.124 Aborted(native code called abort()) Runner.ts:135:15
    printErr Runner.ts:135
    abort IndicatorTest.js:487
    __abort_js IndicatorTest.js:1089
    abort IndicatorTest.wasm:1293944
    emscripten_builtin_free IndicatorTest.wasm:1332212
    IndicatorTest.wasm.operator delete(void*) IndicatorTest.wasm:1482639
    IndicatorTest.wasm.operator delete(void*, unsigned long) IndicatorTest.wasm:1482650
    IndicatorTest.wasm.Dynamic::~Dynamic() IndicatorTest.wasm:184862
    IndicatorTest.wasm.Ref<IndicatorData>::Unset() IndicatorTest.wasm:274033
    IndicatorTest.wasm.Ref<IndicatorData>::~Ref() IndicatorTest.wasm:273760
    IndicatorTest.wasm.IndicatorData::~IndicatorData() IndicatorTest.wasm:366921
    IndicatorTest.wasm.Indicator<IndiEnvelopesParams>::~Indicator() IndicatorTest.wasm:1046810
    IndicatorTest.wasm.Indi_Envelopes::~Indi_Envelopes() IndicatorTest.wasm:1047145
    IndicatorTest.wasm.Indi_Envelopes::~Indi_Envelopes() IndicatorTest.wasm:1047206
    IndicatorTest.wasm.Ref<IndicatorData>::Unset() IndicatorTest.wasm:274033
    IndicatorTest.wasm.Ref<IndicatorData>::~Ref() IndicatorTest.wasm:273760
    IndicatorTest.wasm.DictSlot<long long, Ref<IndicatorData>>::~DictSlot() IndicatorTest.wasm:674141
    IndicatorTest.wasm.std::__2::allocator<DictSlot<long long, Ref<IndicatorData>>>::destroy[abi:ne210108](DictSlot<long long, Ref<IndicatorData>>*) IndicatorTest.wasm:674079
    IndicatorTest.wasm.void std::__2::allocator_traits<std::__2::allocator<DictSlot<long long, Ref<IndicatorData>>>>::destroy[abi:ne210108]<DictSlot<long long, Ref<IndicatorData>>, 0>(std::__2::allocator<DictSlot<long long, Ref<IndicatorData>>>&, DictSlot<long long, Ref<IndicatorData>>*) IndicatorTest.wasm:674018
    invoke_vii IndicatorTest.js:7354
    IndicatorTest.wasm.std::__2::vector<DictSlot<long long, Ref<IndicatorData>>, std::__2::allocator<DictSlot<long long, Ref<IndicatorData>>>>::__base_destruct_at_end[abi:ne210108](DictSlot<long long, Ref<IndicatorData>>*) IndicatorTest.wasm:673405
    IndicatorTest.wasm.std::__2::vector<DictSlot<long long, Ref<IndicatorData>>, std::__2::allocator<DictSlot<long long, Ref<IndicatorData>>>>::clear[abi:ne210108]() IndicatorTest.wasm:672882
    IndicatorTest.wasm.std::__2::vector<DictSlot<long long, Ref<IndicatorData>>, std::__2::allocator<DictSlot<long long, Ref<IndicatorData>>>>::__destroy_vector::operator()[abi:ne210108]() IndicatorTest.wasm:672764
    IndicatorTest.wasm.std::__2::vector<DictSlot<long long, Ref<IndicatorData>>, std::__2::allocator<DictSlot<long long, Ref<IndicatorData>>>>::~vector[abi:ne210108]() IndicatorTest.wasm:672632
    IndicatorTest.wasm._cpp_array<DictSlot<long long, Ref<IndicatorData>>>::~_cpp_array() IndicatorTest.wasm:672554
    IndicatorTest.wasm.DictSlotsRef<long long, Ref<IndicatorData>>::~DictSlotsRef() IndicatorTest.wasm:672493
    IndicatorTest.wasm.DictStruct<long long, Ref<IndicatorData>>::Clear() IndicatorTest.wasm:797186
    IndicatorTest.wasm.Platform::Reset() IndicatorTest.wasm:791893
    IndicatorTest.wasm.Tester::Reset() IndicatorTest.wasm:784941
    IndicatorTest.wasm.emscripten::internal::Invoker<emscripten::internal::rvp::default_tag, void>::invoke(void (*)()) IndicatorTest.wasm:784806
    anonymous IndicatorTest.js line 2209 > Function:6
    run Runner.ts:106
    (Async: async)
    runTest Runner.ts:153
    (Async: async)
    run Runner.ts:162
    test Runner.ts:157
    runChart VApp.vue:614
    onClick VApp.vue:205
    callWithErrorHandling runtime-core.esm-bundler.js:199
    callWithAsyncErrorHandling runtime-core.esm-bundler.js:206
    emit runtime-core.esm-bundler.js:4463
    createSetupContext/get emit/< runtime-core.esm-bundler.js:8356
    handleClick use-button.ts:88
    callWithErrorHandling runtime-core.esm-bundler.js:199
    callWithAsyncErrorHandling runtime-core.esm-bundler.js:206
    invoker runtime-dom.esm-bundler.js:769
    (Async: EventListener.handleEvent)
    addEventListener runtime-dom.esm-bundler.js:696
    patchEvent runtime-dom.esm-bundler.js:714
    patchProp runtime-dom.esm-bundler.js:802
    mountElement runtime-core.esm-bundler.js:5688
    processElement runtime-core.esm-bundler.js:5625
    patch runtime-core.esm-bundler.js:5491
    componentUpdateFn runtime-core.esm-bundler.js:6152
    run reactivity.esm-bundler.js:260
    setupRenderEffect runtime-core.esm-bundler.js:6280
    mountComponent runtime-core.esm-bundler.js:6052
    processComponent runtime-core.esm-bundler.js:6004
    patch runtime-core.esm-bundler.js:5503
    mountChildren runtime-core.esm-bundler.js:5754
    mountElement runtime-core.esm-bundler.js:5670
    processElement runtime-core.esm-bundler.js:5625
    patch runtime-core.esm-bundler.js:5491
    mountChildren runtime-core.esm-bundler.js:5754
    mountElement runtime-core.esm-bundler.js:5670
    processElement runtime-core.esm-bundler.js:5625
    patch runtime-core.esm-bundler.js:5491
    mountChildren runtime-core.esm-bundler.js:5754
    mountElement runtime-core.esm-bundler.js:5670
    processElement runtime-core.esm-bundler.js:5625
    patch runtime-core.esm-bundler.js:5491
    mountChildren runtime-core.esm-bundler.js:5754
    processFragment runtime-core.esm-bundler.js:5934
    patch runtime-core.esm-bundler.js:5477
    mountChildren runtime-core.esm-bundler.js:5754
    mountElement runtime-core.esm-bundler.js:5670
    processElement
```

## Chart lines fading.

There is a problem with lines fading. The fade out on the left side of the side too early, so they are not visible. Look at the blue line of MA indicator [image posted]

## Envelopes indicator values' display problem

Looks like indicators' values are sometimes empty when I hover its lines. Checks what's going on using real ticks from `Forex / EURUSD` ticks data. This happens for e.g., MA and Envelopes indicators.

## Indicator values display on hover

We need to have a possibility to hover nearest values for all indicators. When there is a hover over multiple indicators then we need to list information of their values in the popup separated by newline.

## Project saving/loading.

We need a way to store roaming setting of the application for further restoration, so users can store different configuration of application and charts and chart's indicators configuration.

There are already a menu item in the `App` menu named `Save project`, `Save project as...`. We need to add also `Load project` menu item that will have children menu items with all stored projects. After clicking on the project, app roaming settings should be replaced with that project's data.

`Save project as...` should open a dialog where user could name the project to store the current roaming settings. There will be a button `Cancel` which cancels the save and `Save` button that will store current app roaming settings as the project.

`Save project` should replace current project with actual roaming settings. If there is no current project, it should work the same as `Save project as...`.

Project should be stored in the OPFS file system under `projects/` folder. E.g. if the project name is "Hello" then the file should be named `projects/Hello.prj`.

When app starts, it should just load app roaming settings that we store in the browser's local storage (as it is currently).

The browser's local storage should store the previously openend project name.

In the app's header, after the menu, there should be a name of the currently opened project. If no project is openened then it should say "Untitled project".

We also need to add `New project` menu item to the `App` menu. It should clear the app's roaming settings with default values, the same as it is initialized if no local storage is stored.


## Time-frame selection

In the `Runner.execute()` method we have hardcoded timeframe, i.e. M1. We need to provide a way for user to select a timeframe for the chart under `Ticks` selection and for each of the indicators in the chart. I.e. user could select `Same as chart` time-frame or override the time-frame selected for chart. We then send time-frames for all indicators to the `Runner` class via `AppRoamingStateChart` indicator's options. Then in the `Runner.execute()` we instantiate all required time-frames and attach them to the instantiated indicators.

**Done.** `AppRoamingStateChart.timeframe` holds the chart's time-frame and each indicator has an optional `timeframe` override (`undefined` = "Same as chart"). `Runner.execute()` creates one `lib.indicators.Tf` per distinct time-frame, all fed by the single `TickProvider`, and attaches the matching one to each indicator. The chart's timeline is anchored on the series running on the chart's own time-frame, and `Series.rowAtTime()` lets a coarser-time-frame indicator cover every bar of its interval.