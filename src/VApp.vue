<!-- TEMPLATE -->

<template>
    
    <div class="app col">
        
        <div class="app-header row-0 px-4 py-1 items-center">
            
            <h1 class="app-title flex flex-0">OPENTERMINAL</h1>
            
            <div class="row-0 menu px-4 py-2">
                
                <VMenu class="flex">

                    <VMenuItem label="App" :topMenu="true" id="appMenuApplication">
                        
                        <template #content>
                            
                            <VMenuItem label="New project" id="appMenuNewProject" @clicked="newProject" :close="true" />

                            <VMenuItem label="Projects" id="appMenuLoadProject" :close="false" :enabled="true" @mouseenter="refreshProjects">
                                <template #content>
                                    <VMenuItem v-if="projects.length === 0" label="No stored projects" id="appMenuLoadProjectEmpty" :enabled="false" />
                                    <VMenuItem
                                        v-for="project in projects"
                                        :key="project.name"
                                        :label="project.name"
                                        :id="`appMenuLoadProject-${project.name}`"
                                        :close="true"
                                        @clicked="loadProject(project.name)"
                                    >
                                        <template #content>
                                            <VMenuItem label="Load" :id="`appMenuLoadProject-${project.name}`" :close="true" @clicked="loadProject(project.name)" />
                                            <VMenuItem label="Rename" :id="`appMenuRenameProject-${project.name}`" :close="true" @clicked="openRenameProjectDialog(project.name)" />
                                            <VMenuItem label="Delete" :id="`appMenuDeleteProject-${project.name}`" :close="true" @clicked="openDeleteProjectDialog(project.name)" />
                                        </template>
                                    </VMenuItem>
                                </template>
                            </VMenuItem>

                            <VMenuGroup />

                            <VMenuItem label="Save project" id="appMenuSaveProject" @clicked="saveProject" :close="true" />

                            <VMenuItem label="Save project as..." id="appMenuSaveProjectAs" @clicked="openSaveProjectDialog" :close="true" />

                            <VMenuGroup />

                            <VMenuItem label="Import project..." id="appMenuImportProject" @click="" :close="true" :enabled="false" />

                            <VMenuGroup />
                            
                            <VMenuItem label="Reload window" id="appMenuReload" @click="" :close="true" :enabled="false"></VMenuItem>
                            
                            <VMenuGroup />
                            
                            <VMenuItem label="Exit" id="appMenuExit" @click="$api.appExit()" :close="true" :enabled="false" />
                        </template>
                    </VMenuItem>

                    <VMenuItem label="Edit" :topMenu="true" id="appMenuEdit">
                        <template #content>
                            
                            <VMenuItem label="Undo" id="appMenuEditUndo" :close="true" @clicked="undo" :enabled="$roamingState.canUndo" />
                            <VMenuItem label="Redo" id="appMenuEditRedo" :close="true" @clicked="redo" :enabled="$roamingState.canRedo" />

                        </template>
                    </VMenuItem>

                    <VMenuItem label="Debug" :topMenu="true" id="appMenuDebug">
                        <template #content>
                            
                            <VMenuItem label="Settings" id="appMenuDebugSettings" :close="false">
                                <template #content>
                                    <div class="p-2" style="min-width: 320px; max-width: 480px">
                                        <JsonTreeView :json="settingsJson" colorScheme="dark" :max-depth="3" />
                                    </div>
                                </template>
                            </VMenuItem>

                            <VMenuItem label="Local State" id="appMenuDebugLocalState" :close="false">
                                <template #content>
                                    <div class="p-2" style="min-width: 320px; max-width: 480px">
                                        <JsonTreeView :json="localStateJson" colorScheme="dark" :max-depth="3" />
                                    </div>
                                </template>
                            </VMenuItem>

                            <VMenuItem label="Roaming State" id="appMenuDebugRoamingState" :close="false">
                                <template #content>
                                    <div class="p-2" style="min-width: 320px; max-width: 480px">
                                        <JsonTreeView :json="roamingStateJson" colorScheme="dark" :max-depth="3" />
                                    </div>
                                </template>
                            </VMenuItem>


                        </template>
                    </VMenuItem>

                </VMenu>
                
            </div>

            <ElDivider style="width: 20px" />

            <div class="project-name row-0 pl-6 font-bold">{{ $roamingState.projectName ?? 'Untitled project' }}</div>
            
        </div>

        <ElDialog v-model="saveDialogVisible" title="Save project as" width="400px" append-to-body>
            <ElInput v-model="saveDialogName" placeholder="Project name" @keyup.enter="confirmSaveProject" />
            <div v-if="saveDialogError" class="text-red-400 text-sm mt-2">{{ saveDialogError }}</div>
            <template #footer>
                <ElButton @click="saveDialogVisible = false">Cancel</ElButton>
                <ElButton type="primary" @click="confirmSaveProject">Save</ElButton>
            </template>
        </ElDialog>

        <ElDialog v-model="renameDialogVisible" title="Rename project" width="400px" append-to-body>
            <ElInput v-model="renameDialogName" placeholder="Project name" @keyup.enter="confirmRenameProject" />
            <div v-if="renameDialogError" class="text-red-400 text-sm mt-2">{{ renameDialogError }}</div>
            <template #footer>
                <ElButton @click="renameDialogVisible = false">Cancel</ElButton>
                <ElButton type="primary" @click="confirmRenameProject">Rename</ElButton>
            </template>
        </ElDialog>

        <ElDialog v-model="deleteDialogVisible" title="Delete project" width="400px" append-to-body>
            <div class="text-sm">Delete the project "{{ deleteDialogName }}"? This cannot be undone.</div>
            <div v-if="deleteDialogError" class="text-red-400 text-sm mt-2">{{ deleteDialogError }}</div>
            <template #footer>
                <ElButton @click="deleteDialogVisible = false">Cancel</ElButton>
                <ElButton type="danger" @click="confirmDeleteProject">Delete</ElButton>
            </template>
        </ElDialog>
        
        <main class="app-content flex flex-col flex-1">
            
            <div class="flex flex-row flex-1 min-h-0">
                
                <div class="col">
                    
                    <VCanvas3D ref="canvas" :loading="isChartRunning" />
                    
                </div>

                <div class="side-panel flex flex-col mx-4 min-w-[420px] max-w-[600px] p-4 min-h-0">

                    <ElTabs v-model="activeTab" class="side-panel-tabs flex flex-1 min-h-0">

                        <ElTabPane name="charts" class="side-panel-pane">

                            <template #label>
                                <span class="side-panel-tab-label">
                                    <ElIcon><List /></ElIcon>
                                    <span>Charts</span>
                                </span>
                            </template>

                            <div class="side-panel-content flex flex-col gap-6">

                                <div v-for="chart in $roamingState.charts" :key="chart.title" class="chart-container flex flex-col flex-0">

                                    <div class="chart-container bg-[#111] border border-gray-800 p-2 rounded-lg">

                                        <div class="chart-header flex flex-row flex-1 items-center">

                                            <div class="chart-title flex flex-1 flex-row">
                                                <ElInput v-model="chart.title" placeholder="Chart Title" class="flex flex-1" />
                                            </div>

                                            <ElButton type="danger" icon circle size="small" @click="removeChart(chart.uuid)" class="flex ml-2">
                                                <ElIcon>
                                                    <Delete />
                                                </ElIcon>
                                            </ElButton>

                                        </div>

                                        <div class="chart-tick-source flex flex-row items-center mb-2">
                                            <span class="chart-tick-source-label flex justify-end">Ticks</span>
                                            <ElSelect
                                                :model-value="chart.tickSource?.path ?? ''"
                                                class="flex flex-1"
                                                placeholder="Randomized ticks"
                                                clearable
                                                @update:model-value="setChartTickSource(chart.uuid, $event)"
                                            >
                                                <ElOption
                                                    v-for="source in tickSources"
                                                    :key="source.path"
                                                    :label="source.label"
                                                    :value="source.path"
                                                />
                                            </ElSelect>
                                        </div>

                                        <div class="chart-tick-source flex flex-row items-center mb-2">
                                            <span class="chart-tick-source-label flex justify-end">Time-frame</span>
                                            <ElSelect
                                                :model-value="getChartTimeframe(chart)"
                                                class="flex flex-1"
                                                placeholder="Time-frame"
                                                @update:model-value="setChartTimeframe(chart.uuid, $event)"
                                            >
                                                <ElOption
                                                    v-for="timeframe in timeframes"
                                                    :key="timeframe.id"
                                                    :label="timeframe.label"
                                                    :value="timeframe.id"
                                                />
                                            </ElSelect>
                                        </div>

                                        <div class="chart-tick-source flex flex-row items-center mb-2">
                                            <span class="chart-tick-source-label flex justify-end">Isolate</span>
                                            <ElSelect
                                                :model-value="getChartIsolatedIndicator(chart)"
                                                class="flex flex-1"
                                                placeholder="Show all"
                                                @update:model-value="setChartIsolatedIndicator(chart.uuid, $event)"
                                            >
                                                <ElOption label="Show all" :value="chartIsolateAll" />
                                                <ElOption
                                                    v-for="indicator in chart.indicators"
                                                    :key="indicator.uuid"
                                                    :label="getIndicatorName(indicator)"
                                                    :value="indicator.uuid"
                                                />
                                            </ElSelect>
                                        </div>

                                        <div class="chart-indicators">

                                            <div
                                                v-for="(indicator, indicatorIndex) in chart.indicators"
                                                :key="indicator.uuid"
                                                class="chart-indicator"
                                                :class="{
                                                    'is-dragging': dragState.chartId === chart.uuid && dragState.index === indicatorIndex,
                                                    'is-drop-target': dragState.chartId === chart.uuid && dragState.overIndex === indicatorIndex && dragState.index !== indicatorIndex
                                                }"
                                                draggable="true"
                                                @dragstart="onIndicatorDragStart(chart.uuid, indicatorIndex, $event)"
                                                @dragover.prevent="onIndicatorDragOver(chart.uuid, indicatorIndex, $event)"
                                                @dragleave="onIndicatorDragLeave(chart.uuid, indicatorIndex)"
                                                @drop.prevent="onIndicatorDrop(chart.uuid, indicatorIndex, $event)"
                                                @dragend="onIndicatorDragEnd"
                                                @mouseenter="setIndicatorHighlight(chart.uuid, indicator.typeId)"
                                                @mouseleave="setIndicatorHighlight(chart.uuid, null)"
                                            >
                                                <div class="indicator-type flex flex-row flex-1 px-1.5 py-1.5">
                                                    <span
                                                        class="indicator-collapse-arrow"
                                                        :class="{ 'is-collapsed': isIndicatorCollapsed(indicator) }"
                                                        :title="isIndicatorCollapsed(indicator) ? 'Expand settings' : 'Collapse settings'"
                                                        @click.stop="toggleIndicatorCollapsed(indicator)"
                                                    >
                                                        <ElIcon><ArrowDown /></ElIcon>
                                                    </span>
                                                    <ElCheckbox
                                                        size="small"
                                                        class="indicator-visibility-toggle ml-2"
                                                        :model-value="isIndicatorVisible(chart.uuid, indicator)"
                                                        :title="getIndicatorVisibilityTitle(chart.uuid, indicator)"
                                                        @click.stop="toggleIndicatorVisibility(chart.uuid, indicator)"
                                                    ></ElCheckbox>
                                                    <span class="indicator-drag-handle" title="Drag to reorder">⋮⋮</span>
                                                    <div class="indicator-name flex flex-1" :class="{ 'is-hidden': !isIndicatorVisible(chart.uuid, indicator) }">
                                                        {{ getIndicatorName(indicator) }}
                                                    </div>
                                                    <span class="indicator-color-bullets px-4">
                                                        <ElPopover
                                                            v-for="(color, valueIndex) in getIndicatorColors(indicator)"
                                                            :key="valueIndex"
                                                            :ref="(el: any) => setColorPickerRef(indicator.uuid, valueIndex, el)"
                                                            trigger="click"
                                                            placement="bottom-start"
                                                            :width="318"
                                                            :persistent="false"
                                                            popper-class="indicator-color-popover"
                                                            @hide="clearIndicatorColorPreview(chart.uuid, indicator, valueIndex)"
                                                        >
                                                            <template #reference>
                                                                <span
                                                                    class="indicator-color-bullet"
                                                                    :class="{ 'is-hidden': !isIndicatorVisible(chart.uuid, indicator) }"
                                                                    :style="{ backgroundColor: getIndicatorBulletColor(indicator, valueIndex, color) }"
                                                                    :title="getIndicatorColorTitle(indicator, valueIndex)"
                                                                ></span>
                                                            </template>

                                                            <div class="indicator-color-picker">
                                                                <div class="indicator-color-picker-title">
                                                                    <span
                                                                        class="indicator-color-preview-chip"
                                                                        :style="{ backgroundColor: getIndicatorBulletColor(indicator, valueIndex, color) }"
                                                                    ></span>
                                                                    <span class="indicator-color-picker-label">
                                                                        {{ getIndicatorValueLabel(indicator, valueIndex) }}
                                                                    </span>
                                                                    <span class="indicator-color-preview-hex">
                                                                        {{ getIndicatorBulletColor(indicator, valueIndex, color) }}
                                                                    </span>
                                                                </div>

                                                                <div class="indicator-color-swatches row flex-wrap gap-2">
                                                                    <span
                                                                        v-for="swatch in indicatorPalette"
                                                                        :key="swatch"
                                                                        class="indicator-color-swatch col-0"
                                                                        :class="{ 'is-selected': swatch.toLowerCase() === color.toLowerCase() }"
                                                                        :style="{ backgroundColor: swatch }"
                                                                        :title="swatch"
                                                                        @mouseenter="previewIndicatorColor(chart.uuid, indicator, valueIndex, swatch)"
                                                                        @mouseleave="clearIndicatorColorPreview(chart.uuid, indicator, valueIndex)"
                                                                        @focus="previewIndicatorColor(chart.uuid, indicator, valueIndex, swatch)"
                                                                        @blur="clearIndicatorColorPreview(chart.uuid, indicator, valueIndex)"
                                                                        @click="setIndicatorColor(chart.uuid, indicator, valueIndex, swatch)"
                                                                    ></span>
                                                                </div>

                                                                <div class="indicator-color-custom">
                                                                    <span class="indicator-color-custom-label">Custom</span>
                                                                    <ElColorPicker
                                                                        :model-value="color"
                                                                        size="small"
                                                                        :teleported="false"
                                                                        :predefine="indicatorPalette"
                                                                        @change="setIndicatorColor(chart.uuid, indicator, valueIndex, $event)"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </ElPopover>
                                                    </span>
                                                    <ElButton type="danger" circle icon size="small" @click="removeIndicator(chart.uuid, indicator.uuid)">
                                                        <ElIcon>
                                                            <Delete />
                                                        </ElIcon>
                                                    </ElButton>
                                                </div>

                                                <div
                                                    v-if="getIndicatorSettingsUI(indicator.typeId)"
                                                    class="indicator-config-wrapper"
                                                    :class="{ 'is-collapsed': isIndicatorCollapsed(indicator) }"
                                                >
                                                    <div class="indicator-config-inner">
                                                        <div class="indicator-config p-3">
                                                            <div class="attribute indicator-name-input">
                                                                <div class="attribute-label">Name</div>
                                                                <div class="attribute-value">
                                                                    <ElInput
                                                                        v-model="indicator.name"
                                                                        :placeholder="indicator.typeId"
                                                                        @input="applyIndicatorNames(chart.uuid)"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div class="attribute indicator-timeframe">
                                                                <div class="attribute-label">Time-frame</div>
                                                                <div class="attribute-value">
                                                                    <ElSelect
                                                                        :model-value="getIndicatorTimeframe(indicator)"
                                                                        class="flex flex-1"
                                                                        placeholder="Same as chart"
                                                                        @update:model-value="setIndicatorTimeframe(chart.uuid, indicator.uuid, $event)"
                                                                    >
                                                                        <ElOption label="Same as chart" :value="indicatorTimeframeChart" />
                                                                        <ElOption
                                                                            v-for="timeframe in timeframes"
                                                                            :key="timeframe.id"
                                                                            :label="timeframe.label"
                                                                            :value="timeframe.id"
                                                                        />
                                                                    </ElSelect>
                                                                </div>
                                                            </div>
                                                            <div class="attribute indicator-timeframe">
                                                                <div class="attribute-label">Data source</div>
                                                                <div class="attribute-value">
                                                                    <ElSelect
                                                                        :model-value="getIndicatorSource(chart, indicator)"
                                                                        class="flex flex-1"
                                                                        placeholder="Time-frame"
                                                                        :disabled="getIndicatorSourceOptions(chart, indicator).length === 0"
                                                                        @update:model-value="setIndicatorSource(chart.uuid, indicator.uuid, $event)"
                                                                    >
                                                                        <ElOption label="Time-frame" :value="indicatorSourceTimeframe" />
                                                                        <ElOption
                                                                            v-for="candidate in getIndicatorSourceOptions(chart, indicator)"
                                                                            :key="candidate.uuid"
                                                                            :label="getIndicatorName(candidate)"
                                                                            :value="candidate.uuid"
                                                                        />
                                                                    </ElSelect>
                                                                </div>
                                                            </div>
                                                            <component :is="getIndicatorSettingsUI(indicator.typeId)" :roamingState="$roamingState.charts.find(c => c.uuid === chart.uuid).indicators.find(i => i.uuid === indicator.uuid)   " />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                        </div>

                                        <div class="add-indicator-button mt-2 flex justify-end">
                                            <ElButton class="row" v-popup="{ popup: addIndicatorContextMenuInstance, event: 'click', data: { chartId: chart.uuid } }">
                                                Add Indicator
                                                <ElIcon class="ml-2">
                                                    <ArrowDown />
                                                </ElIcon>
                                            </ElButton>

                                            <ElButton type="primary" class="row" @click="runChart(chart.uuid)" :disabled="isChartRunning || chart.indicators.length == 0">
                                                Run
                                            </ElButton>
                                        </div>

                                    </div>

                                </div>

                                <div class="add-chart-button flex flex-row justify-end">
                                    <ElButton type="default" class="flex flex-1 max-w-[200px]" @click="addChart()" disabled>
                                        Add Chart
                                    </ElButton>
                                </div>

                            </div>

                        </ElTabPane>

                        <ElTabPane name="ticks" class="side-panel-pane">

                            <template #label>
                                <span class="side-panel-tab-label">
                                    <ElIcon><Upload /></ElIcon>
                                    <span>Upload Ticks</span>
                                </span>
                            </template>

                            <div class="side-panel-content flex flex-col gap-6">

                                <VTicksUpload class="ticks-upload-container flex flex-0" @uploaded="onTicksUploaded" />

                            </div>

                        </ElTabPane>

                        <ElTabPane name="opfs" class="side-panel-pane">

                            <template #label>
                                <span class="side-panel-tab-label">
                                    <ElIcon><FolderOpened /></ElIcon>
                                    <span>Browser Storage</span>
                                </span>
                            </template>

                            <div class="side-panel-content flex flex-col gap-6">

                                <VOPFSExplorer class="opfs-explorer-container flex flex-0" />

                            </div>

                        </ElTabPane>

                    </ElTabs>

                </div>

            </div>
            
        </main>
        
        <VPopUp ref="addIndicatorContextMenu" :width="200">
            <VMenu class="col" :bordered="true" v-if="addIndicatorContextMenuInstance">
                <div class="py-2 justify-center items-center text-sm text-[#ff] bg-[#1f1f1f] font-bold flex">
                    Add Indicator
                </div>

                <VMenuGroup title="Built-ins" :separator="false" />

                <VMenuGroup />

                <VMenuItem v-for="indicator in $settings.indicators" :key="indicator.typeId" :id="`add-${indicator.typeId.toLowerCase()}`" :label="indicator.typeId" :close="true" :enabled="true" @clicked="addIndicator(addIndicatorContextMenuInstance.data.chartId, indicator.typeId)" />
            </VMenu>
        </VPopUp>

    </div>
    
</template>


<!-- SCRIPT -->

<script lang="ts">

    import { AppLocalStateChart } from "./api/data/AppLocalState";
    import { Chart } from "./api/rendering/objects/Chart";
    import { Runner } from "./api/tester/Runner";
    import VMenu from './components/menu/VMenu.vue';
    import VMenuGroup from './components/menu/VMenuGroup.vue';
    import VMenuItem from './components/menu/VMenuItem.vue';
    import VCanvas3D from './components/rendering/VCanvas3D.vue';
    import VOPFSExplorer from './components/data/opfs/VOPFSExplorer.vue';
    import VTicksUpload from './components/data/VTicksUpload.vue';
    import { ElDivider, ElIcon, ElPopover, ElColorPicker } from "element-plus";
    import VPopUp from "./components/menu/VPopUp.vue";
    import { type ComponentInstance } from "vue";
    import { markRaw } from "vue";
    import { ChartGrid } from "./api/rendering/objects/ChartGrid";
    import { Series } from "./api/rendering/objects/Series";
    import { ChartObjectManipulator } from "./api/rendering/plugins/chart/ChartObjectManipulator";
    import { JsonTreeView } from 'json-tree-view-vue3';
    import { opfs } from "./api/OPFS";
    import { NotFound } from "./api/Throwables";
    import { listAppProjects, loadAppProject, normalizeAppProjectName, saveAppProject, renameAppProject, deleteAppProject, type AppProjectInfo } from "./api/data/AppProjects";
    import { APP_TIMEFRAMES, normalizeAppTimeframe, type AppTimeframe } from "./api/data/AppTimeframes";
    import { INDICATOR_PALETTE, getIndicatorColorCount, getIndicatorValueTitles, randomIndicatorColors, resolveIndicatorColors } from "./api/data/IndicatorColors";

    /**
     * Delay (in milliseconds) used to coalesce bursts of OPFS changes into a single tick source
     * refresh. Uploading ticks emits one change per file.
     */
    const TICK_SOURCES_REFRESH_DEBOUNCE = 150;

    /**
     * Value of the indicator's time-frame selector that makes the indicator follow the chart's
     * time-frame. It is never stored in the roaming state.
     */
    const INDICATOR_TIMEFRAME_CHART = 'chart';

    /** Value of the indicator's data source selector that selects the time-frame indicator. */
    const INDICATOR_SOURCE_TIMEFRAME = 'timeframe';

    /**
     * Value of the chart's "Isolate" selector that shows every indicator. It is never stored in the
     * roaming state — the selector stores the isolated indicator's UUID instead.
     */
    const CHART_ISOLATE_ALL = 'all';
    
    @Component({
        components: {
            VCanvas3D,
            VOPFSExplorer,
            VTicksUpload,
            VMenu,
            VMenuItem,
            VMenuGroup,
            VPopUp,
            JsonTreeView,
            ElPopover,
            ElColorPicker
        }
    })
    export class VApp extends Vue
    {
        addIndicatorContextMenuInstance: any = null;

        @Ref
        canvas!: ComponentInstance<typeof VCanvas3D>;

        public charts: Chart[] = [];

        /** Palette offered by the color picker of the indicator bullets. */
        public indicatorPalette: readonly string[] = INDICATOR_PALETTE;

        /**
         * Color picker popovers of the indicator bullets, keyed by `<indicator uuid>:<value index>`.
         *
         * Kept so a picker can be closed once the user picked a color. `markRaw` keeps Vue from
         * proxying the component instances stored here.
         */
        private colorPickerRefs: Record<string, { hide?: () => void }> = markRaw({});

        /**
         * Color currently previewed by hovering a swatch, keyed by `<indicator uuid>:<value index>`.
         *
         * Hovering a swatch paints the indicator's bullet (and the chip in the popover) with that
         * color, so the user can judge it against the chart before committing. The entry is removed
         * when the pointer leaves the swatch or the popover closes.
         */
        public indicatorColorPreviews: Record<string, string> = {};

        /**
         * Name of the tab currently shown in the right-hand side panel.
         *
         * One of `charts`, `ticks` or `opfs`.
         */
        public activeTab: string = 'charts';

        /**
         * Incremented after a chart finishes running. Charts are `markRaw`, so their series are not
         * reactive; reading this counter in the template makes the color bullets re-render once the
         * series (and therefore their colors) exist.
         */
        public chartRunVersion: number = 0;

        /** Number of chart runs currently in progress. */
        public runningChartCount: number = 0;

        /**
         * Value of the chart's "Isolate" selector that shows every indicator.
         *
         * The selector stores the UUID of the isolated indicator, so this sentinel stands for "no
         * isolation" and is never persisted.
         */
        public chartIsolateAll: string = CHART_ISOLATE_ALL;

        get isChartRunning(): boolean {
            return this.runningChartCount > 0;
        }

        /**
         * State of the indicator drag-and-drop reordering.
         */
        public dragState: { chartId: string | null; index: number; overIndex: number } = {
            chartId: null,
            index: -1,
            overIndex: -1
        };

        /**
         * Tick data folders found in the OPFS, offered as tick sources for the charts.
         *
         * Each entry is a `ticks/<folder>/<symbol>` directory, i.e. one uploaded symbol.
         */
        public tickSources: { path: string; label: string; symbol: string }[] = [];

        /** Time-frames offered by the chart and indicator selectors. */
        public timeframes: readonly AppTimeframe[] = APP_TIMEFRAMES;

        /** Value of the indicator's time-frame selector meaning "Same as chart". */
        public indicatorTimeframeChart: string = INDICATOR_TIMEFRAME_CHART;

        /** Value of the indicator's data source selector meaning "the time-frame indicator". */
        public indicatorSourceTimeframe: string = INDICATOR_SOURCE_TIMEFRAME;

        /** Incremented once the wasm module used for source compatibility checks is ready. */
        public compatibilityVersion: number = 0;

        /** Unregisters the OPFS change listener, or `null` when not subscribed. */
        private unsubscribeFromOPFS: (() => void) | null = null;

        /** Timer that coalesces OPFS change notifications into a single tick source refresh. */
        private tickSourcesRefreshTimer: ReturnType<typeof setTimeout> | null = null;

        private stringifyMaxDepth(value: object): string {
            const depths = new WeakMap<object, number>();
            return JSON.stringify(value, function (this: object, _key: string, current: unknown) {
                if (current === null || typeof current !== "object") {
                    return current;
                }

                const depth = (depths.get(this) ?? 0) + 1;
                if (depth > 6) {
                    return Array.isArray(current) ? `[Array(${current.length})]` : "[Object]";
                }

                depths.set(current, depth);
                return current;
            }, 2);
        }

        get settingsJson(): string {
            return this.stringifyMaxDepth(this.$settings);
        }

        get localStateJson(): string {
            return this.stringifyMaxDepth(this.$localState);
        }

        get roamingStateJson(): string {
            return this.stringifyMaxDepth(this.$roamingState);
        }


        /** Projects stored in the OPFS, shown in the `Load project` menu. */
        public projects: AppProjectInfo[] = [];

        public saveDialogVisible: boolean = false;
        public saveDialogName: string = '';
        public saveDialogError: string = '';

        public renameDialogVisible: boolean = false;
        /** Name of the project being renamed, as stored in the OPFS. */
        public renameDialogProject: string = '';
        public renameDialogName: string = '';
        public renameDialogError: string = '';

        public deleteDialogVisible: boolean = false;
        /** Name of the project the delete confirmation is about. */
        public deleteDialogName: string = '';
        public deleteDialogError: string = '';

        public async refreshProjects(): Promise<void> {
            try {
                this.projects = await listAppProjects();
            }
            catch (error) {
                console.error('Failed to list the stored projects.', error);
            }
        }

        /** Replaces the roaming state with the default (empty) one. */
        public newProject(): void {
            const ohlc = this.$settings.indicators.find(ind => ind.typeId === 'OHLC');

            this.$roamingState.replaceCharts([{
                uuid: crypto.randomUUID(),
                title: 'Untitled Chart',
                timeframe: normalizeAppTimeframe(undefined),
                indicators: [{
                    uuid: 'indicator0',
                    typeId: 'OHLC',
                    config: JSON.parse(JSON.stringify(ohlc?.defaultConfig ?? {})),
                    visible: true,
                    colors: randomIndicatorColors(getIndicatorColorCount('OHLC'))
                }]
            }]);
            this.$roamingState.projectName = null;
            this.syncWithRoamingState();
        }

        public async loadProject(name: string): Promise<void> {
            try {
                const data = await loadAppProject(name);

                this.$roamingState.replaceCharts(Array.isArray(data?.charts) ? data.charts : []);
                this.$roamingState.projectName = name;
                this.syncWithRoamingState();
            }
            catch (error) {
                console.error(`Failed to load the project "${name}".`, error);
                alert(`Failed to load the project "${name}": ${error instanceof Error ? error.message : error}`);
            }
        }

        public openSaveProjectDialog(): void {
            this.saveDialogName = this.$roamingState.projectName ?? '';
            this.saveDialogError = '';
            this.saveDialogVisible = true;
        }

        /** Saves over the current project, or asks for a name when there is none. */
        public async saveProject(): Promise<void> {
            if (!this.$roamingState.projectName) {
                this.openSaveProjectDialog();
                return;
            }

            try {
                await this.storeProject(this.$roamingState.projectName);
            }
            catch (error) {
                console.error('Failed to save the project.', error);
                alert(`Failed to save the project: ${error instanceof Error ? error.message : error}`);
            }
        }

        public async confirmSaveProject(): Promise<void> {
            try {
                const name = normalizeAppProjectName(this.saveDialogName);

                await this.storeProject(name);
                this.saveDialogVisible = false;
            }
            catch (error) {
                this.saveDialogError = error instanceof Error ? error.message : String(error);
            }
        }

        private async storeProject(name: string): Promise<void> {
            await saveAppProject(name, { charts: JSON.parse(JSON.stringify(this.$roamingState.charts)) });
            this.$roamingState.projectName = name;
            await this.refreshProjects();
        }

        /** Opens the rename dialog for the given stored project. */
        public openRenameProjectDialog(name: string): void {
            this.renameDialogProject = name;
            this.renameDialogName = name;
            this.renameDialogError = '';
            this.renameDialogVisible = true;
        }

        /** Renames the project in the OPFS and keeps the open project pointing at the new name. */
        public async confirmRenameProject(): Promise<void> {
            try {
                const newName = await renameAppProject(this.renameDialogProject, this.renameDialogName);

                // The renamed project may be the one that is currently open.
                if (this.$roamingState.projectName === this.renameDialogProject)
                    this.$roamingState.projectName = newName;

                this.renameDialogVisible = false;
                await this.refreshProjects();
            }
            catch (error) {
                this.renameDialogError = error instanceof Error ? error.message : String(error);
            }
        }

        /** Opens the delete confirmation for the given stored project. */
        public openDeleteProjectDialog(name: string): void {
            this.deleteDialogName = name;
            this.deleteDialogError = '';
            this.deleteDialogVisible = true;
        }

        /** Deletes the project from the OPFS after the user confirmed it. */
        public async confirmDeleteProject(): Promise<void> {
            try {
                await deleteAppProject(this.deleteDialogName);

                // The deleted project may be the one that is currently open, so it must not be
                // saved over by accident anymore.
                if (this.$roamingState.projectName === this.deleteDialogName)
                    this.$roamingState.projectName = null;

                this.deleteDialogVisible = false;
                await this.refreshProjects();
            }
            catch (error) {
                this.deleteDialogError = error instanceof Error ? error.message : String(error);
            }
        }

        public async mounted(): Promise<void> {
            this.addIndicatorContextMenuInstance = this.$refs.addIndicatorContextMenu;

            // Any OPFS change (a project being saved, renamed or deleted, ticks being uploaded,
            // or an action performed in the OPFS explorer) may add or remove a tick source, so
            // the selector is rebuilt from the current OPFS contents.
            this.unsubscribeFromOPFS = opfs.onChange(() => this.scheduleTickSourcesRefresh());

            this.refreshProjects();

            Runner.loadCompatibilityLibrary()
                .then(() => this.compatibilityVersion++)
                .catch(error => console.error('Failed to load the indicator compatibility library.', error));

            // Keeps the overlay up while tick sources load, before the first chart run starts.
            this.runningChartCount++;

            const isFirstVisit = localStorage.getItem('AppRoamingState') === null;

            try {
                await this.refreshTickSources();

                if (isFirstVisit) {
                    this.newProject();
                    return;
                }

                // Adding charts
                this.$roamingState.charts.forEach(chartConfig => {
                    this.addChart(chartConfig);

                    // Running each chart asynchronously.
                    this.runChart(chartConfig.uuid);
                });
            }
            finally {
                this.runningChartCount--;
            }
        }

        public unmounted(): void {
            this.unsubscribeFromOPFS?.();
            this.unsubscribeFromOPFS = null;

            this.cancelScheduledTickSourcesRefresh();
        }

        /**
         * Rebuilds the list of tick sources from the folders stored under `ticks` in the OPFS.
         *
         * The upload panel stores ticks as `ticks/<folder>/<symbol>/<file>.csv`, so every
         * directory two levels deep is one selectable source.
         */
        public async refreshTickSources(): Promise<void> {
            this.cancelScheduledTickSourcesRefresh();

            const sources: { path: string; label: string; symbol: string }[] = [];

            try {
                for (const folder of await opfs.listEntries('ticks')) {
                    if (folder.kind !== 'directory')
                        continue;

                    for (const symbol of await opfs.listEntries(folder.fullPath)) {
                        if (symbol.kind !== 'directory')
                            continue;

                        sources.push({
                            path: symbol.fullPath,
                            label: `${folder.name} / ${symbol.name}`,
                            symbol: symbol.name
                        });
                    }
                }
            }
            catch (error) {
                // Nothing uploaded yet, so there is nothing to offer.
                if (!(error instanceof NotFound))
                    console.error('Failed to list the tick sources stored in the OPFS.', error);
            }

            this.tickSources = sources.sort((a, b) => a.label.localeCompare(b.label));
        }

        /**
         * Schedules a tick source refresh, replacing a refresh that is already pending.
         *
         * Uploading ticks emits one OPFS change per file, so the refresh is debounced to avoid
         * walking the whole `ticks` tree once per uploaded file.
         */
        private scheduleTickSourcesRefresh(): void {
            this.cancelScheduledTickSourcesRefresh();

            this.tickSourcesRefreshTimer = setTimeout(() => {
                this.tickSourcesRefreshTimer = null;

                this.refreshTickSources().catch(error => {
                    console.error('Failed to refresh the tick sources.', error);
                });
            }, TICK_SOURCES_REFRESH_DEBOUNCE);
        }

        private cancelScheduledTickSourcesRefresh(): void {
            if (this.tickSourcesRefreshTimer === null)
                return;

            clearTimeout(this.tickSourcesRefreshTimer);
            this.tickSourcesRefreshTimer = null;
        }

        /**
         * Points the chart at the given tick source and re-runs it, so the new ticks are used.
         *
         * @param chartId UUID of the chart to configure.
         * @param path OPFS folder of the tick source, or an empty value for randomized ticks.
         */
        public async setChartTickSource(chartId: string, path: string | null): Promise<void> {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);

            if (!chart)
                return;

            const source = this.tickSources.find(candidate => candidate.path === path);

            chart.tickSource = source
                ? { path: source.path, symbol: source.symbol }
                : undefined;

            await this.runChart(chartId);
        }

        /**
         * Returns the time-frame the chart's bars are built on.
         *
         * Charts saved before time-frames were selectable have none, so the default one is shown
         * instead of an empty selector.
         */
        public getChartTimeframe(chart: { timeframe?: string }): string {
            return normalizeAppTimeframe(chart.timeframe);
        }

        /**
         * Returns the value the chart's "Isolate" selector should show.
         *
         * The isolated indicator is stored by UUID, so a stale UUID (the indicator was removed)
         * falls back to "Show all" instead of leaving the selector blank.
         */
        public getChartIsolatedIndicator(chart: { isolatedIndicator?: string | null; indicators: { uuid: string }[] }): string {
            const uuid = chart.isolatedIndicator;

            if (!uuid || !chart.indicators.some(indicator => indicator.uuid === uuid))
                return CHART_ISOLATE_ALL;

            return uuid;
        }

        /**
         * Isolates one of the chart's indicators, or shows them all again.
         *
         * The isolated indicator keeps full opacity while every other indicator is faded, the same
         * way the hover highlight fades them. Unlike the hover highlight it persists, so it is
         * stored in the roaming state.
         *
         * @param chartId UUID of the chart to configure.
         * @param indicatorId UUID of the indicator to isolate, or `CHART_ISOLATE_ALL`.
         */
        public setChartIsolatedIndicator(chartId: string, indicatorId: string | null): void {
            const chartConfig = this.$roamingState.charts.find(chart => chart.uuid === chartId);

            if (!chartConfig)
                return;

            chartConfig.isolatedIndicator = !indicatorId || indicatorId === CHART_ISOLATE_ALL
                ? null
                : indicatorId;

            this.applyChartIsolation(chartId);
        }

        /**
         * Pushes the chart's persisted isolation to its series.
         *
         * The isolated indicator is resolved to its type id, because the series are matched by the
         * indicator type they were built from rather than by the roaming state's UUID.
         */
        private applyChartIsolation(chartId: string): void {
            const chartConfig = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            const chart = this.$localState.charts[chartId]?.threejs.chart;

            if (!chartConfig || !chart)
                return;

            const isolated = chartConfig.indicators.find(indicator => indicator.uuid === chartConfig.isolatedIndicator);

            chart.setSeriesIsolated(isolated?.typeId ?? null);
        }

        /**
         * Sets the chart's time-frame and re-runs it, so its bars are rebuilt on the new one.
         *
         * Indicators that follow the chart ("Same as chart") move along with it.
         *
         * @param chartId UUID of the chart to configure.
         * @param timeframe Time-frame id from `APP_TIMEFRAMES`.
         */
        public async setChartTimeframe(chartId: string, timeframe: string | null): Promise<void> {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);

            if (!chart)
                return;

            chart.timeframe = normalizeAppTimeframe(timeframe);

            await this.runChart(chartId);
        }

        /**
         * Returns the time-frame configured on the given indicator.
         *
         * Indicators that do not override the chart's time-frame report the "Same as chart"
         * sentinel, so the selector shows that as a real selection instead of a placeholder.
         */
        public getIndicatorTimeframe(indicator: { timeframe?: string }): string {
            return indicator.timeframe ?? INDICATOR_TIMEFRAME_CHART;
        }
        /**
         * Sets the indicator's time-frame and re-runs the chart, so the indicator is recalculated
         * on it.
         *
         * @param chartId UUID of the chart the indicator belongs to.
         * @param indicatorId UUID of the indicator to configure.
         * @param timeframe Time-frame id from `APP_TIMEFRAMES`, or the "Same as chart" sentinel.
         */
        public async setIndicatorTimeframe(chartId: string, indicatorId: string, timeframe: string | null): Promise<void> {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            const indicator = chart?.indicators.find(indicator => indicator.uuid === indicatorId);

            if (!chart || !indicator)
                return;

            // "Same as chart" drops the override instead of storing an explicit copy of the
            // chart's time-frame, so the indicator keeps following the chart when it changes.
            indicator.timeframe = timeframe && timeframe !== INDICATOR_TIMEFRAME_CHART
                ? normalizeAppTimeframe(timeframe)
                : undefined;

            await this.runChart(chartId);
        }

        /**
         * Returns the name shown for the indicator, which is its type id until it is renamed.
         */
        public getIndicatorName(indicator: { typeId: string; name?: string }): string {
            return indicator.name?.trim() || indicator.typeId;
        }

        /**
         * Pushes the chart's indicator names to the chart, so its popups show them.
         *
         * Series are matched by indicator type, so the first indicator of a type provides the name.
         */
        public applyIndicatorNames(chartId: string): void {
            const chartConfig = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            const chart = this.$localState.charts[chartId]?.threejs.chart;

            if (!chartConfig || !chart)
                return;

            const names: Record<string, string> = {};

            for (const indicator of chartConfig.indicators)
                names[indicator.typeId] ??= this.getIndicatorName(indicator);

            chart.setIndicatorNames(names);
        }

        /**
         * Returns the indicators of the chart the given indicator may run over.
         *
         * An indicator never runs over itself or over an indicator that (directly or not) runs over
         * it, and the candidate has to be accepted by the library's compatibility check.
         */
        public getIndicatorSourceOptions(
            chart: { uuid: string; indicators: { uuid: string; typeId: string; name?: string; source?: string }[] },
            indicator: { uuid: string; typeId: string }
        ): { uuid: string; typeId: string; name?: string }[] {
            // Re-evaluated once the compatibility library has loaded.
            void this.compatibilityVersion;

            const runner = this.$localState.charts[chart.uuid]?.runner;

            if (!runner)
                return [];

            const dependsOnIndicator = (candidate: { uuid: string; source?: string }): boolean => {
                const visited = new Set<string>();
                let current: { uuid: string; source?: string } | undefined = candidate;

                while (current && !visited.has(current.uuid)) {
                    if (current.uuid === indicator.uuid)
                        return true;

                    visited.add(current.uuid);
                    current = chart.indicators.find(other => other.uuid === current!.source);
                }

                return false;
            };

            return chart.indicators.filter(candidate =>
                candidate.uuid !== indicator.uuid
                && !dependsOnIndicator(candidate)
                && runner.checkIndicatorSourceCompatibility(indicator.typeId, candidate.typeId)
            );
        }

        /**
         * Returns the value the indicator's "Data source" selector should show.
         */
        public getIndicatorSource(
            chart: { uuid: string; indicators: { uuid: string; typeId: string; name?: string; source?: string }[] },
            indicator: { uuid: string; typeId: string; source?: string }
        ): string {
            const isOffered = this.getIndicatorSourceOptions(chart, indicator).some(candidate => candidate.uuid === indicator.source);

            return indicator.source && isOffered ? indicator.source : INDICATOR_SOURCE_TIMEFRAME;
        }

        /**
         * Sets the indicator the given indicator runs over and re-runs the chart.
         *
         * @param indicatorId UUID of the indicator to configure.
         * @param source UUID of the data source indicator, or the time-frame sentinel.
         */
        public async setIndicatorSource(chartId: string, indicatorId: string, source: string | null): Promise<void> {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            const indicator = chart?.indicators.find(indicator => indicator.uuid === indicatorId);

            if (!chart || !indicator)
                return;

            indicator.source = source && source !== INDICATOR_SOURCE_TIMEFRAME ? source : undefined;

            await this.runChart(chartId);
        }

        /**
         * Adds a new or existing chart to the scene. If it's a new chart, it will be added to the roaming state.
         * @param config Optional chart configuration.
         */
        public addChart(config?: any): void {
            const chart = markRaw(new Chart(150, 0.01, 0.00));

            if (config)
                this.charts.push(chart);
            else {
                config = {
                    uuid: crypto.randomUUID(),
                    title: 'Untitled Chart',
                    timeframe: normalizeAppTimeframe(undefined),
                    indicators: []
                };

                this.$roamingState.charts.push(config);
            }

            chart.uuid = config.uuid;

            // Adding default local state for the chart.
            this.$localState.mounted(chart, new ChartGrid(chart), config);

            console.log(`Mounted chart with UUID: ${chart.uuid}`, config);

            chart.setData(null);

            // Adding the chart to the scene.
            this.canvas.scene.add(chart);
        }
        
        /**
         * Removes a chart from the scene and the roaming state.
         * @param chartId The UUID of the chart to remove.
         */
        public removeChart(chartId: string): void {
            console.log(`Removing chart with ID: ${chartId}`);
            const chart = this.charts.find(chart => chart.uuid === chartId);

            // Removing the chart from the scene as well, otherwise it would keep rendering and a
            // later undo would mount a second chart with the same UUID next to it.
            if (chart) {
                this.canvas.scene.remove(chart);
                chart.dispose();
            }

            this.$localState.unmounted(chartId);
            this.$roamingState.charts = this.$roamingState.charts.filter(chart => chart.uuid !== chartId);
            this.charts = this.charts.filter(chart => chart.uuid !== chartId);
        }

        /**
         * Restores the roaming state that was active before the last change and re-syncs the
         * scene with it.
         */
        public undo(): void {
            if (this.$roamingState.undo())
                this.syncWithRoamingState();
        }

        /**
         * Re-applies the roaming state that was undone by the last undo and re-syncs the scene
         * with it.
         */
        public redo(): void {
            if (this.$roamingState.redo())
                this.syncWithRoamingState();
        }

        /**
         * Reconciles the Three.js scene and the local state with the roaming state.
         *
         * Undo/redo replaces the roaming state's chart objects, so charts that disappeared have to
         * be torn down and charts that came back have to be mounted again. The remaining charts
         * are re-pointed at the restored config objects and re-run, so their series match the
         * restored indicators.
         */
        private syncWithRoamingState(): void {
            const configs = this.$roamingState.charts;
            const configIds = new Set(configs.map(config => config.uuid));

            // Tearing down charts that no longer exist in the roaming state.
            for (const chart of [...this.charts]) {
                if (configIds.has(chart.uuid))
                    continue;

                this.canvas.scene.remove(chart);
                chart.dispose();
                this.$localState.unmounted(chart.uuid);
                this.charts = this.charts.filter(candidate => candidate.uuid !== chart.uuid);
            }

            // Mounting charts that were restored.
            for (const config of configs) {
                if (this.charts.some(chart => chart.uuid === config.uuid))
                    continue;

                this.addChart(config);
            }

            // Re-pointing the runners at the restored config objects and re-running the charts.
            for (const config of configs) {
                const chartLocalState = this.$localState.charts[config.uuid];

                if (!chartLocalState)
                    continue;

                chartLocalState.runner.chartConfig = config;

                this.runChart(config.uuid).catch(error => {
                    console.error(`Failed to re-run chart ${config.uuid} after restoring the roaming state.`, error);
                });
            }
        }

        public addIndicator(chartId: string, indicatorTypeId: string, config?: any): void {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            if (chart) {
                // Colors already taken by the chart's other indicators, so the new one stands out.
                const usedColors = chart.indicators.flatMap(indicator => this.getIndicatorColors(indicator));

                chart.indicators.push({
                    uuid: crypto.randomUUID(),
                    typeId: indicatorTypeId,
                    name: indicatorTypeId,
                    config: config ?? JSON.parse(JSON.stringify(this.$settings.indicators.find(ind => ind.typeId === indicatorTypeId)?.defaultConfig)),
                    visible: true,
                    // One random color per value, so every line of the indicator is distinct.
                    colors: randomIndicatorColors(getIndicatorColorCount(indicatorTypeId), usedColors)
                });
            }
        }

        public removeIndicator(chartId: string, indicatorId: string): void {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            if (chart) {
                chart.indicators = chart.indicators.filter(indicator => indicator.uuid !== indicatorId);

                // Indicators that ran over the removed one go back to the time-frame indicator.
                for (const indicator of chart.indicators) {
                    if (indicator.source === indicatorId)
                        indicator.source = undefined;
                }

                // The isolated indicator may be the one that was just removed, so drop the stale
                // isolation instead of leaving the chart dimmed with nothing highlighted.
                if (chart.isolatedIndicator === indicatorId) {
                    chart.isolatedIndicator = null;
                    this.applyChartIsolation(chartId);
                }
            }
        }

        public async runChart(chartId: string): Promise<void> {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);

            if (!chart)
                return;

            // Fetching local state for the chart.
            const chartLocalState = this.$localState.charts[chartId];

            console.log(`Running chart with ID: ${chartId}`, chart, chartLocalState);

            this.runningChartCount++;

            return new Promise<void>(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            })
                .then(() => chartLocalState.runner.test())
                .then(() => {
                    // Apply the persisted per-indicator visibility to the freshly created series.
                    this.applyIndicatorVisibility(chartId);

                    // Re-apply the persisted isolation, so a re-run does not clear it.
                    this.applyChartIsolation(chartId);
                    this.applyIndicatorNames(chartId);

                    // Charts are markRaw, so bump a reactive counter to refresh the indicator color bullets.
                    this.chartRunVersion++;

                    const chartObjectManipulator = this.canvas.renderer?.getRenderPass('main')?.tryGetPlugin(ChartObjectManipulator);
                    if (chartObjectManipulator) {
                        chartObjectManipulator.setCurrentChart(chartLocalState.threejs.chart);
                        chartObjectManipulator.centerCameraOnChart();
                    }
                })
                .finally(() => {
                    this.runningChartCount--;
                });
        }

        /**
         * Rebuilds the tick source selector after tick files have been stored, so the new source
         * shows up without the user having to reload the page.
         */
        public async onTicksUploaded(): Promise<void> {
            // The explorer refreshes itself through the OPFS change notifications, so only the
            // tick source selector has to be rebuilt here.
            await this.refreshTickSources();
        }

        public getIndicatorSettingsUI(typeId: string): any {
            for (const indicator of this.$settings.indicators) {
                if (indicator.typeId === typeId) {
                    return indicator.ui;
                }
            }
            return null;
        }

        /**
         * Returns the CSS colors the given indicator's values are drawn with on the chart.
         *
         * There is one color per value the indicator emits, so a multi-value indicator (e.g.
         * Bands' Base/Upper/Lower) shows one bullet per line. The colors are stored per indicator,
         * so they stay the same when the list is reordered.
         *
         * This is called from the template, so it must not modify the roaming state; indicators
         * saved before per-value colors existed are migrated when the state is loaded instead.
         */
        public getIndicatorColors(indicator: { typeId: string; colors?: string[]; color?: string }): string[] {
            // Establishes a reactive dependency so the bullets refresh after a chart run.
            void this.chartRunVersion;

            return resolveIndicatorColors(indicator);
        }

        /**
         * Human readable name of the given value of an indicator, e.g. "Upper" for Bands.
         *
         * Values without a configured title fall back to "Value N". Indicators that only have a
         * single color (single-value ones and candlestick ones like OHLC) are simply named after
         * the indicator, because their bullet stands for the whole indicator.
         */
        public getIndicatorValueLabel(indicator: { typeId: string }, valueIndex: number): string {
            if (getIndicatorColorCount(indicator.typeId) <= 1)
                return indicator.typeId;

            const title = getIndicatorValueTitles(indicator.typeId)[valueIndex];

            return title || `Value ${valueIndex + 1}`;
        }

        /**
         * Tooltip of a color bullet: what the value is called and what clicking does.
         */
        public getIndicatorColorTitle(indicator: { typeId: string }, valueIndex: number): string {
            const label = this.getIndicatorValueLabel(indicator, valueIndex);

            return `${label} — Click to change the color`;
        }

        /**
         * Tooltip of the on/off sphere: what clicking it does to the indicator's visibility.
         */
        public getIndicatorVisibilityTitle(chartId: string, indicator: { visible?: boolean }): string {
            return this.isIndicatorVisible(chartId, indicator)
                ? 'Hide this indicator'
                : 'Show this indicator';
        }

        /**
         * Sets the color of a single value of the given indicator and redraws the chart.
         *
         * The color is stored in the roaming state, so it is persisted and can be undone.
         */
        public setIndicatorColor(
            chartId: string,
            indicator: { uuid: string; typeId: string; colors?: string[]; color?: string },
            valueIndex: number,
            color: string | null
        ): void {
            if (!color)
                return;

            const colors = [...this.getIndicatorColors(indicator)];
            colors[valueIndex] = color;

            indicator.colors = colors;
            delete indicator.color;

            this.clearIndicatorColorPreview(chartId, indicator, valueIndex);
            this.applyIndicatorVisibility(chartId);

            // The picker has done its job, so it should not stay open over the chart.
            this.colorPickerRefs[`${indicator.uuid}:${valueIndex}`]?.hide?.();
        }

        /**
         * Color the bullet of the given value should be painted with.
         *
         * While the user hovers a swatch this is the hovered color, so the bullet previews the
         * change; otherwise it is the color stored in the roaming state.
         */
        public getIndicatorBulletColor(
            indicator: { uuid: string },
            valueIndex: number,
            color: string
        ): string {
            return this.indicatorColorPreviews[`${indicator.uuid}:${valueIndex}`] ?? color;
        }

        /**
         * Previews `color` on the given value of the indicator, without storing it.
         *
         * The preview is applied to the chart as well as to the bullet, so hovering a swatch shows
         * the line or bar in the candidate color before the user commits to it.
         */
        public previewIndicatorColor(
            chartId: string,
            indicator: { uuid: string; typeId: string; colors?: string[]; color?: string },
            valueIndex: number,
            color: string
        ): void {
            this.indicatorColorPreviews[`${indicator.uuid}:${valueIndex}`] = color;
            this.applyIndicatorColorPreview(chartId, indicator);
        }

        /** Stops previewing the color of the given value, restoring the stored one. */
        public clearIndicatorColorPreview(
            chartId: string,
            indicator: { uuid: string; typeId: string; colors?: string[]; color?: string },
            valueIndex: number
        ): void {
            const key = `${indicator.uuid}:${valueIndex}`;

            if (!(key in this.indicatorColorPreviews))
                return;

            delete this.indicatorColorPreviews[key];
            this.applyIndicatorColorPreview(chartId, indicator);
        }

        /**
         * Pushes the indicator's colors to its series, substituting the previewed values.
         *
         * Only the given indicator is touched, so previewing a color does not disturb the other
         * indicators of the chart.
         */
        private applyIndicatorColorPreview(
            chartId: string,
            indicator: { uuid: string; typeId: string; colors?: string[]; color?: string }
        ): void {
            const chart = this.$localState.charts[chartId]?.threejs.chart;

            if (!chart)
                return;

            const colors = this.getIndicatorColors(indicator).map((color, index) =>
                this.indicatorColorPreviews[`${indicator.uuid}:${index}`] ?? color
            );

            chart.setSeriesColors(indicator.typeId, colors.map(color => Series.parseColor(color)));
        }

        /**
         * Keeps a reference to the color picker popover of a single value of an indicator, so it
         * can be closed once a color has been picked.
         */
        public setColorPickerRef(indicatorId: string, valueIndex: number, instance: any): void {
            const key = `${indicatorId}:${valueIndex}`;

            if (instance)
                this.colorPickerRefs[key] = instance;
            else
                delete this.colorPickerRefs[key];
        }

        /**
         * Whether the given indicator's data is currently drawn on the chart.
         *
         * Indicators default to visible, so a missing flag means visible.
         */
        public isIndicatorVisible(chartId: string, indicator: { visible?: boolean }): boolean {
            void chartId;

            return indicator.visible !== false;
        }

        /**
         * Toggles whether the given indicator's data is drawn on the chart.
         *
         * The flag lives in the roaming state, so it is persisted to browser storage automatically
         * and restored on the next load.
         */
        public toggleIndicatorVisibility(chartId: string, indicator: { typeId: string; visible?: boolean }): void {
            indicator.visible = indicator.visible === false;

            this.applyIndicatorVisibility(chartId);
        }

        /**
         * Pushes the persisted visibility and colors of every indicator of the chart to its series.
         */
        private applyIndicatorVisibility(chartId: string): void {
            const chartConfig = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            const chart = this.$localState.charts[chartId]?.threejs.chart;

            if (!chartConfig || !chart)
                return;

            for (const indicator of chartConfig.indicators) {
                chart.setSeriesVisible(indicator.typeId, indicator.visible !== false);
                chart.setSeriesColors(
                    indicator.typeId,
                    this.getIndicatorColors(indicator).map(color => Series.parseColor(color))
                );
            }
        }

        /**
         * Starts dragging an indicator within its chart.
         */
        public onIndicatorDragStart(chartId: string, index: number, event: DragEvent): void {
            this.dragState = { chartId, index, overIndex: index };

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                // Firefox requires data to be set for the drag to start.
                event.dataTransfer.setData('text/plain', String(index));
            }
        }

        /**
         * Highlights the indicator currently under the dragged item.
         */
        public onIndicatorDragOver(chartId: string, index: number, event: DragEvent): void {
            if (this.dragState.chartId !== chartId)
                return;

            if (event.dataTransfer)
                event.dataTransfer.dropEffect = 'move';

            this.dragState.overIndex = index;
        }

        /**
         * Clears the drop highlight when the pointer leaves an indicator.
         */
        public onIndicatorDragLeave(chartId: string, index: number): void {
            if (this.dragState.chartId === chartId && this.dragState.overIndex === index)
                this.dragState.overIndex = -1;
        }

        /**
         * Moves the dragged indicator to the drop position.
         */
        public onIndicatorDrop(chartId: string, index: number, event: DragEvent): void {
            event.stopPropagation();

            const from = this.dragState.chartId === chartId ? this.dragState.index : -1;

            this.onIndicatorDragEnd();

            if (from < 0 || from === index)
                return;

            this.moveIndicator(chartId, from, index);
        }

        /**
         * Resets the drag state.
         */
        public onIndicatorDragEnd(): void {
            this.dragState = { chartId: null, index: -1, overIndex: -1 };
        }

        /**
         * Whether the given indicator's settings panel is collapsed.
         *
         * Indicators default to expanded, so a missing flag means expanded.
         */
        public isIndicatorCollapsed(indicator: { collapsed?: boolean }): boolean {
            return indicator.collapsed === true;
        }

        /**
         * Expands or collapses the given indicator's settings panel.
         *
         * The flag lives in the roaming state, so it is persisted to browser storage automatically
         * and restored on the next load.
         */
        public toggleIndicatorCollapsed(indicator: { collapsed?: boolean }): void {
            indicator.collapsed = !this.isIndicatorCollapsed(indicator);
        }

        /**
         * Highlights the given indicator while the user hovers its settings panel.
         *
         * The hovered indicator keeps full opacity while every other indicator of the chart is
         * faded, so the lines and bars being configured stand out from the rest of the chart.
         * Passing `null` restores every indicator to full opacity.
         */
        public setIndicatorHighlight(chartId: string, typeId: string | null): void {
            const chart = this.$localState.charts[chartId]?.threejs.chart;

            if (!chart)
                return;

            chart.setSeriesDimmed(typeId);
        }

        /**
         * Moves an indicator within its chart's list.
         *
         * The indicator keeps its own color, so reordering does not change how anything is drawn.
         */
        public moveIndicator(chartId: string, from: number, to: number): void {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);

            if (!chart)
                return;

            if (from < 0 || from >= chart.indicators.length || to < 0 || to >= chart.indicators.length)
                return;

            const [moved] = chart.indicators.splice(from, 1);
            chart.indicators.splice(to, 0, moved);
        }
    }

    export default toNative(VApp);

</script>


<!-- STYLE -->

<style lang="scss" scoped>

    .app {
        height: 100vh;
        max-height: 100vh;
        overflow: hidden;
        background-color: #000;
        color: #d4d4d4;
    }

    .app-header {
    }

    .project-name {
        color: #bbb;
    }

    .app-title {
        font-size: 16px;
        font-weight: 700;
        color: #999;
    }

    .app-content {
        overflow: hidden;
    }

    // Right-hand side panel: the tab header stays put while the active tab scrolls.
    .side-panel {
        min-height: 0;
    }

    .side-panel-tabs {
        min-height: 0;

        :deep(.el-tabs__header) {
            margin-bottom: 8px;
        }

        // The content area is the only part that may grow, so the header never scrolls away.
        :deep(.el-tabs__content) {
            display: flex;
            flex-direction: column;
            flex: 1 1 auto;
            min-height: 0;
            padding: 0;
            overflow: hidden;
        }

        :deep(.el-tab-pane) {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
        }
    }

    .side-panel-content {
        padding-right: 4px;
    }

    .side-panel-tab-label {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
    }

    .chart-header {
        margin-bottom: 8px;
    }

    .chart-tick-source {
        gap: 8px;
    }

    .chart-tick-source-label {
        flex: 0 0 auto;
        // Fixed width so the Ticks and Time-frame selectors line up with each other.
        min-width: 80px;
        color: #888;
    }

    .chart-title {
        font-size: 14px;
        font-weight: 700;
    }

    .chart-indicators {
        display: flex;
        flex-direction: column;
        gap: calc(var(--spacing) * 2);
        
    }

    .indicator-name {
        flex: 1 1 auto;
        align-self: center;
        color: #ccc;

        &.is-hidden {
            opacity: 0.5;
        }
    }

    .indicator-type {
        font-weight: bold;
        color: #fff;
        background-color: #191919;
        border-bottom: 1px solid #292929;
    }

    .indicator-color-bullets {
        display: inline-flex;
        flex: 0 0 auto;
        flex-direction: row;
        align-items: center;
        align-self: center;
        gap: 4px;
        margin-right: 4px;
    }

    .indicator-color-bullet {
        display: inline-block;
        flex: 0 0 auto;
        align-self: center;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        margin-left: 2px;
        margin-top: 2px;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
        cursor: pointer;
        transition: opacity 0.15s ease, box-shadow 0.15s ease;

        &:hover {
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
        }

        // Hidden indicators keep their color but are dimmed, so the on/off sphere stays the
        // single control for visibility.
        &.is-hidden {
            opacity: 0.35;
        }
    }

    .chart-indicator {
        border: 1px solid #333;
        border-radius: 4px;
        background-color: #111;
        color: #888;

        &.is-dragging {
            opacity: 0.4;
        }

        &.is-drop-target {
            border-color: #4caf50;
            box-shadow: 0 0 0 1px #4caf50;
        }

        &:hover {
            border-color: #4caf50;
        }
    }

    .indicator-drag-handle {
        flex: 0 0 auto;
        align-self: center;
        padding: 0 16px 0 12px;
        color: #555;
        font-size: 15px;
        letter-spacing: -2px;
        cursor: grab;
        user-select: none;

        &:hover {
            color: #aaa;
        }
    }

    .indicator-collapse-arrow {
        display: inline-flex;
        flex: 0 0 auto;
        align-self: center;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        color: #777;
        cursor: pointer;
        user-select: none;
        // Rotating the arrow is the whole animation, so keep it on the compositor.
        transition: transform 0.2s ease, color 0.15s ease;

        &:hover {
            color: #ddd;
        }

        // Expanded: arrow points down. Collapsed: arrow points right.
        &.is-collapsed {
            transform: rotate(-90deg);
        }
    }

    // Animates the settings panel open and closed using a grid row transition, which works
    // without knowing the panel's height.
    .indicator-config-wrapper {
        display: grid;
        grid-template-rows: 1fr;
        transition: grid-template-rows 0.2s ease, opacity 0.2s ease;
        opacity: 1;

        > .indicator-config-inner {
            overflow: hidden;
            min-height: 0;
        }

        &.is-collapsed {
            grid-template-rows: 0fr;
            opacity: 0;
        }
    }

    // The time-frame selector is rendered by the app, not by the indicator's own settings
    // component, so it needs its own spacing to the fields below it.
    .indicator-timeframe {
        margin-bottom: 1rem;
    }

</style>


<!-- STYLE: color picker popover -->

<!--
    The popover is teleported to the body, so its styles cannot be scoped to this component.
-->
<style lang="scss">

    .indicator-color-popover.el-popover.el-popper {
        padding: 8px;
        background-color: #1b1b1b;
        border: 1px solid #333;
        color: #ccc;
    }

    .indicator-color-picker {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .indicator-color-picker-title {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 700;
        color: #ddd;
    }

    .indicator-color-picker-label {
        flex: 1;
    }

    // Shows the color the pointer is over, so the user can judge it before committing.
    .indicator-color-preview-chip {
        display: block;
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        border-radius: 4px;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
        transition: background-color 0.1s ease;
    }

    .indicator-color-preview-hex {
        flex: 0 0 auto;
        font-family: monospace;
        font-size: 11px;
        font-weight: 400;
        color: #888;
    }

    .indicator-color-swatch {
        display: block;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        cursor: pointer;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
        transition: transform 0.1s ease, box-shadow 0.1s ease;

        &:hover {
            transform: scale(1.12);
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7);
        }

        &.is-selected {
            box-shadow: 0 0 0 2px #fff;
        }
    }

    .indicator-color-custom {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-top: 4px;
        border-top: 1px solid #2c2c2c;
    }

    .indicator-color-custom-label {
        font-size: 12px;
        color: #888;
    }

    // The picker's panel is normally positioned by a popper, which does not work inside another
    // popper. Making it static lets it flow below the swatches and grow the popover instead.
    .indicator-color-popover .el-color-picker__panel {
        position: static !important;
        inset: auto !important;
        flex: 0 0 100%;
        margin-top: 4px;
        border: 1px solid #333;
        box-shadow: none;
    }

</style>

<style lang="scss">

    .indicator-visibility-toggle {
        .el-checkbox__input {
            .el-checkbox__inner {
                width: 16px !important;
                height: 16px !important;
            }
        }

        &.is-checked {
            .el-checkbox__inner {
                background-color: #1e4a27 !important;
                border-color: #40a17f !important;
            }
        }
    }

</style>
