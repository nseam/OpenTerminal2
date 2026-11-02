<!-- TEMPLATE -->

<template>
    
    <div class="app col">
        
        <div class="app-header row-0 px-4 py-1 items-center">
            
            <h1 class="app-title flex flex-0">OPENTERMINAL</h1>
            
            <div class="flex flex-row flex-1 menu px-4 py-2">
                
                <VMenu class="flex">

                    <VMenuItem label="App" :topMenu="true" id="appMenuApplication">
                        
                        <template #content>
                            
                            <VMenuItem label="Save project" id="appMenuNewProject" @click="" :close="true" :enabled="false" />

                            <VMenuItem label="Save project as..." id="appMenuNewProject" @click="" :close="true" :enabled="false" />

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

                    <VMenuItem label="Help" :topMenu="true" id="appMenuHelp">
                        <template #content>
                            
                            <VMenuItem label="Settings" id="appMenuHelpSettings" :close="false">
                                <template #content>
                                    <div class="p-2" style="min-width: 320px; max-width: 480px">
                                        <JsonTreeView :json="settingsJson" colorScheme="dark" :max-depth="3" />
                                    </div>
                                </template>
                            </VMenuItem>

                            <VMenuItem label="Local State" id="appMenuHelpLocalState" :close="false">
                                <template #content>
                                    <div class="p-2" style="min-width: 320px; max-width: 480px">
                                        <JsonTreeView :json="localStateJson" colorScheme="dark" :max-depth="3" />
                                    </div>
                                </template>
                            </VMenuItem>

                            <VMenuItem label="Roaming State" id="appMenuHelpRoamingState" :close="false">
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
            
        </div>
        
        <main class="app-content flex flex-col flex-1">
            
            <div class="flex flex-row flex-1 min-h-0">
                
                <div class="col">
                    
                    <VCanvas3D ref="canvas" />
                    
                </div>

                <div class="flex flex-col mx-4 min-w-[420px] max-w-[600px] p-4">

                    <div class="flex flex-col flex-1 min-h-0 max-h-full overflow-y-auto gap-6">

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
                                                    <component :is="getIndicatorSettingsUI(indicator.typeId)" :roamingState="$roamingState.charts.find(c => c.uuid === chart.uuid).indicators.find(i => i.uuid === indicator.uuid)   " />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>

                                <div class="add-indicator-button mt-2 flex justify-end">
                                    <ElButton type="primary" class="flex flex-1" @click="runChart(chart.uuid)" :disabled="chart.indicators.length == 0">
                                        Run
                                    </ElButton>

                                    <ElButton type="" v-popup="{ popup: addIndicatorContextMenuInstance, event: 'click', data: { chartId: chart.uuid } }">
                                        Add Indicator
                                        <ElIcon class="ml-2">
                                            <ArrowDown />
                                        </ElIcon>
                                    </ElButton>
                                </div>

                            </div>

                        </div>

                        <div class="add-chart-button flex flex-row justify-end">
                            <ElButton type="default" class="flex flex-1 max-w-[200px]" @click="addChart()">
                                Add Chart
                            </ElButton>
                        </div>

                    </div>

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
    import { ElIcon } from "element-plus";
    import VPopUp from "./components/menu/VPopUp.vue";
    import { type ComponentInstance } from "vue";
    import { markRaw } from "vue";
    import { ChartGrid } from "./api/rendering/objects/ChartGrid";
    import { Series } from "./api/rendering/objects/Series";
    import { ChartObjectManipulator } from "./api/rendering/plugins/chart/ChartObjectManipulator";
    import { JsonTreeView } from 'json-tree-view-vue3';
    
    @Component({
        components: {
            VCanvas3D,
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
         * Incremented after a chart finishes running. Charts are `markRaw`, so their series are not
         * reactive; reading this counter in the template makes the color bullets re-render once the
         * series (and therefore their colors) exist.
         */
        public chartRunVersion: number = 0;

        /**
         * State of the indicator drag-and-drop reordering.
         */
        public dragState: { chartId: string | null; index: number; overIndex: number } = {
            chartId: null,
            index: -1,
            overIndex: -1
        };

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


        public async mounted(): Promise<void> {
            this.addIndicatorContextMenuInstance = this.$refs.addIndicatorContextMenu;

            // Adding charts
            this.$roamingState.charts.forEach(chartConfig => {
                this.addChart(chartConfig);

                // Running each chart asynchronously.
                this.runChart(chartConfig.uuid);
            });
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
            if (chart)
                this.canvas.scene.remove(chart);

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

            await chartLocalState.runner.test();

            // Apply the persisted per-indicator visibility to the freshly created series.
            this.applyIndicatorVisibility(chartId);

            // Charts are markRaw, so bump a reactive counter to refresh the indicator color bullets.
            this.chartRunVersion++;

            const chartObjectManipulator = this.canvas.renderer?.getRenderPass('main')?.tryGetPlugin(ChartObjectManipulator);
            if (chartObjectManipulator) {
                chartObjectManipulator.setCurrentChart(chartLocalState.threejs.chart);
                chartObjectManipulator.centerCameraOnChart();
            }
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

    .app-title {
        font-size: 16px;
        font-weight: 700;
        color: #999;
    }

    .app-content {
        overflow: hidden;
    }

    .chart-header {
        margin-bottom: 8px;
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

</style>
