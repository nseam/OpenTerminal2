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
                                            <span class="chart-tick-source-label">Ticks</span>
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
                                            <span class="chart-tick-source-label">Time-frame</span>
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
                                                    <span class="indicator-drag-handle" title="Drag to reorder">⋮⋮</span>
                                                    <span
                                                        class="indicator-color-bullet"
                                                        :class="{ 'is-hidden': !isIndicatorVisible(chart.uuid, indicator) }"
                                                        :style="{ backgroundColor: getIndicatorColor(chart.uuid, indicator) }"
                                                        :title="isIndicatorVisible(chart.uuid, indicator) ? `Hide ${indicator.typeId} on the chart` : `Show ${indicator.typeId} on the chart`"
                                                        @click="toggleIndicatorVisibility(chart.uuid, indicator)"
                                                    ></span>
                                                    <div class="indicator-name flex flex-1 ml-1.5" :class="{ 'is-hidden': !isIndicatorVisible(chart.uuid, indicator) }">
                                                        {{ indicator.typeId }}
                                                    </div>
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
    import VMenu from './components/menu/VMenu.vue';
    import VMenuGroup from './components/menu/VMenuGroup.vue';
    import VMenuItem from './components/menu/VMenuItem.vue';
    import VCanvas3D from './components/rendering/VCanvas3D.vue';
    import VOPFSExplorer from './components/data/opfs/VOPFSExplorer.vue';
    import VTicksUpload from './components/data/VTicksUpload.vue';
    import { ElDivider, ElIcon } from "element-plus";
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
    
    @Component({
        components: {
            VCanvas3D,
            VOPFSExplorer,
            VTicksUpload,
            VMenu,
            VMenuItem,
            VMenuGroup,
            VPopUp,
            JsonTreeView
        }
    })
    export class VApp extends Vue
    {
        addIndicatorContextMenuInstance: any = null;

        @Ref
        canvas!: ComponentInstance<typeof VCanvas3D>;

        public charts: Chart[] = [];

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
                    color: Series.formatColor(Series.getSeriesColor(0))
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
                chart.indicators.push({
                    uuid: `indicator${chart.indicators.length}`,
                    typeId: indicatorTypeId,
                    config: config ?? JSON.parse(JSON.stringify(this.$settings.indicators.find(ind => ind.typeId === indicatorTypeId)?.defaultConfig)),
                    visible: true,
                    // Assign the next palette color so it stays with the indicator when reordered.
                    color: Series.formatColor(Series.getSeriesColor(chart.indicators.length))
                });
            }
        }

        public removeIndicator(chartId: string, indicatorId: string): void {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            if (chart) {
                chart.indicators = chart.indicators.filter(indicator => indicator.uuid !== indicatorId);
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
         * Returns the CSS color the given indicator is drawn with on the chart.
         *
         * The color is stored per indicator, so it stays the same when the list is reordered.
         * Falls back to the palette color derived from the indicator's position.
         */
        public getIndicatorColor(chartId: string, indicator: { typeId: string; color?: string }): string {
            // Establishes a reactive dependency so the bullet refreshes after a chart run.
            void this.chartRunVersion;

            if (indicator.color)
                return indicator.color;

            const chartConfig = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            const index = chartConfig ? chartConfig.indicators.indexOf(indicator as any) : -1;

            return Series.formatColor(Series.getSeriesColor(Math.max(0, index)));
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
         * Pushes the persisted visibility and color of every indicator of the chart to its series.
         */
        private applyIndicatorVisibility(chartId: string): void {
            const chartConfig = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            const chart = this.$localState.charts[chartId]?.threejs.chart;

            if (!chartConfig || !chart)
                return;

            for (const indicator of chartConfig.indicators) {
                chart.setSeriesVisible(indicator.typeId, indicator.visible !== false);
                chart.setSeriesColor(indicator.typeId, Series.parseColor(indicator.color));
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

    .indicator-color-bullet {
        display: inline-block;
        flex: 0 0 auto;
        align-self: center;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-left: 2px;
        margin-right: 4px;
        margin-top: 2px;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
        cursor: pointer;
        transition: opacity 0.15s ease, box-shadow 0.15s ease;

        &:hover {
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
        }

        // Hidden indicators keep their color but are dimmed and hollowed out.
        &.is-hidden {
            opacity: 0.3;
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25), inset 0 0 0 2px #111;
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
