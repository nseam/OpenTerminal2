<!-- TEMPLATE -->

<template>
    
    <div class="app col">
        
        <div class="app-header row-0 px-4 py-1 items-center">
            
            <h1 class="app-title flex flex-0">OPENTERMINAL</h1>
            
            <div class="flex flex-row flex-1 menu px-4 py-2">
                
                <VMenu class="flex">

                    <VMenuItem label="App" :topMenu="true" id="appMenuApplication">
                        
                        <template #content>
                            
                            <VMenuItem label="Save project" id="appMenuNewProject" @click="" :close="true" />

                            <VMenuItem label="Save project as..." id="appMenuNewProject" @click="" :close="true" />

                            <VMenuGroup />

                            <VMenuItem label="Import project..." id="appMenuImportProject" @click="" :close="true" />

                            <VMenuGroup />
                            
                            <VMenuItem label="Reload window" id="appMenuReload" @click="" :close="true"></VMenuItem>
                            
                            <VMenuGroup />
                            
                            <VMenuItem label="Exit" id="appMenuExit" @click="$api.appExit()" :close="true" />
                        </template>
                    </VMenuItem>

                    <VMenuItem label="Charts" :topMenu="true" id="appMenuCharts">
                        
                        <template #content>

                            <VMenuGroup  />
                            
                            <div v-for="chart in $roamingState.charts" :key="chart.title">
                                <VMenuItem :label="chart.title" :topMenu="true" :id="`selectChart(${chart.uuid})`" @click="addIndicator" :close="true">
                                    <template #content>
                                        <VMenuItem label="Remove Chart" :topMenu="true" :id="`removeChart(${chart.uuid})`" @click="removeChart" :close="true" />
                                    </template>
                                </VMenuItem>
                            </div>

                            <VMenuGroup  />

                            <VMenuItem label="Add Chart" :topMenu="true" :id="`addChart`" @click="addChart" :close="true" />


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

                <div class="flex flex-col mx-4 mb-4 min-w-[420px] max-w-[600px] border-3 border-solid border-[#333] rounded-lg p-4">

                    <div class="flex flex-col flex-1 min-h-0 max-h-full overflow-y-auto">

                        <div v-for="chart in $roamingState.charts" :key="chart.title" class="chart-container flex flex-col flex-0">

                            <div class="chart-header flex flex-row flex-1 items-center ">

                                <div class="chart-title flex flex-1 flex-row">
                                    <ElInput v-model="chart.title" placeholder="Chart Title" class="flex flex-1" />
                                </div>

                                <ElButton type="danger" icon size="small" @click="removeChart(chart.uuid)" class="flex ml-2">
                                    <ElIcon>
                                        <Delete />
                                    </ElIcon>
                                </ElButton>

                            
                            </div>

                            <div class="chart-indicators">

                                <div v-for="indicator in chart.indicators" :key="indicator.uuid" class="chart-indicator">
                                    <div class="indicator-type flex flex-row flex-1 px-1.5 py-1.5">
                                        <div class="flex flex-1 ml-1.5">
                                            {{ indicator.typeId }}
                                        </div>
                                        <ElButton type="danger" icon size="small" @click="removeIndicator(chart.uuid, indicator.uuid)">
                                            <ElIcon>
                                                <Delete />
                                            </ElIcon>
                                        </ElButton>
                                    </div>

                                    <div v-if="getIndicatorSettingsUI(indicator.typeId)" class="indicator-config p-3">
                                        <component :is="getIndicatorSettingsUI(indicator.typeId)" :roamingState="$roamingState.charts.find(c => c.uuid === chart.uuid).indicators.find(i => i.uuid === indicator.uuid)   " />
                                    </div>
                                </div>

                            </div>

                            <div class="add-indicator-button mt-2 flex justify-end">
                                <ElButton type="" v-popup="{ popup: addIndicatorContextMenuInstance, event: 'click', data: { chartId: chart.uuid } }">
                                    Add Indicator
                                    <ElIcon class="ml-2">
                                        <ArrowDown />
                                    </ElIcon>
                                </ElButton>

                                <ElButton type="primary" @click="runChart(chart.uuid)" :disabled="chart.indicators.length == 0">
                                    Run
                                </ElButton>
                            </div>

                            <ElDivider class="my-6!" />

                        </div>

                        <div class="add-chart-button">
                            <ElButton type="primary" @click="addChart()">
                                Add Chart
                            </ElButton>
                        </div>

                    </div>

                    <ElDivider class="my-3!" />
                
                    <div class="flex flex-col-0">

                        <ElButton type="primary">
                            Run
                        </ElButton>

                    </div>

                </div>

            </div>
            
        </main>
        
        <VPopUp ref="addIndicatorContextMenu" :width="200">
            <VMenu class="col" :bordered="true" v-if="addIndicatorContextMenuInstance">
                <div class="py-2 justify-center items-center text-sm text-[#bbb] bg-[#f1f1f1f] font-bold flex">
                    Add Indicator
                </div>


                <VMenuGroup title="Built-ins" :separator="false" />

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

        get settingsJson(): string {
            return JSON.stringify(this.$settings, null, 2);
        }

        get localStateJson(): string {
            return JSON.stringify(this.$localState, null, 2);
        }

        get roamingStateJson(): string {
            return JSON.stringify(this.$roamingState, null, 2);
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
            const chart = this.charts.find(chart => chart.uuid === chartId)!;

            this.$localState.unmounted(chartId);
            this.$roamingState.charts = this.$roamingState.charts.filter(chart => chart.uuid !== chartId);
            this.charts = this.charts.filter(chart => chart.uuid !== chartId);
        }

        public addIndicator(chartId: string, indicatorTypeId: string, config?: any): void {
            const chart = this.$roamingState.charts.find(chart => chart.uuid === chartId);
            if (chart) {
                chart.indicators.push({
                    uuid: `indicator${chart.indicators.length}`,
                    typeId: indicatorTypeId,
                    config: config ?? JSON.parse(JSON.stringify(this.$settings.indicators.find(ind => ind.typeId === indicatorTypeId)?.defaultConfig))
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

    .indicator-type {
        font-weight: bold;
        color: #fff;
        background-color: #191919;
        border-bottom: 1px solid #292929;
    }

    .chart-indicator {
        border: 1px solid #333;
        border-radius: 4px;
        background-color: #111;
        color: #888;
    }

</style>
