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
                            
                            <div v-for="chart in roamingState.charts" :key="chart.title">
                                <VMenuItem :label="chart.title" :topMenu="true" :id="`selectChart(${chart.id})`" @click="addIndicator" :close="true">
                                    <template #content>
                                        <VMenuItem label="Remove Chart" :topMenu="true" :id="`removeChart(${chart.id})`" @click="removeChart" :close="true" />
                                    </template>
                                </VMenuItem>
                            </div>

                            <VMenuGroup  />

                            <VMenuItem label="Add Chart" :topMenu="true" :id="`addChart`" @click="addChart" :close="true" />


                        </template>

                    </VMenuItem>

                </VMenu>
                
            </div>
            
        </div>
        
        <main class="app-content flex flex-col flex-1">
            
            <div class="flex flex-row flex-1 min-h-0">
                
                <div class="col">
                    
                    <VCanvas3D />
                    
                </div>

                <div class="flex flex-col mx-4 mb-4 min-w-[420px] max-w-[600px] border-3 border-solid border-[#333] rounded-lg p-4">

                    <div class="flex flex-col flex-1 min-h-0 max-h-full overflow-y-auto">

                        <div v-for="chart in roamingState.charts" :key="chart.title" class="chart-container flex flex-col flex-0">

                            <div class="chart-header flex flex-row flex-1 items-center ">

                                <div class="chart-title flex flex-1 flex-row">
                                    <ElInput v-model="chart.title" placeholder="Chart Title" class="flex flex-1" />
                                </div>

                                <ElButton type="danger" icon size="small" @click="removeChart(chart.id)" class="flex ml-2" :disabled="roamingState.charts.length <= 1">
                                    <ElIcon>
                                        <Delete />
                                    </ElIcon>
                                </ElButton>

                            
                            </div>

                            <div class="chart-indicators">

                                <div v-for="indicator in chart.indicators" :key="indicator.id" class="chart-indicator">
                                    <div class="indicator-type flex flex-row flex-1 px-3 py-1.5">
                                        <div class="flex flex-1">
                                            {{ indicator.typeId }}
                                        </div>
                                        <ElButton type="danger" icon size="small" @click="removeIndicator(chart.id, indicator.id)">
                                            <ElIcon>
                                                <Delete />
                                            </ElIcon>
                                        </ElButton>
                                    </div>

                                    <div v-if="getIndicatorSettingsUI(indicator.typeId)" class="indicator-config p-3">
                                        <component :is="getIndicatorSettingsUI(indicator.typeId)" :roamingState="roamingState.charts.find(c => c.id === chart.id).indicators.find(i => i.id === indicator.id)   " />
                                    </div>
                                </div>

                            </div>

                            <div class="add-indicator-button mt-2 flex justify-end">
                                <ElButton type="primary" v-popup="{ popup: addIndicatorContextMenuInstance, event: 'click', data: { chartId: chart.id } }">
                                    Add Indicator
                                    <ElIcon class="ml-2">
                                        <ArrowDown />
                                    </ElIcon>
                                </ElButton>
                            </div>

                            <ElDivider class="my-6!" />

                        </div>

                        <div class="add-chart-button">
                            <ElButton type="primary" @click="addChart">
                                Add Chart
                            </ElButton>
                        </div>

                    </div>

                    <ElDivider class="my-3!" />
                
                    <div class="flex flex-col-0">

                        <ElButton type="primary" @click="run">
                            Run
                        </ElButton>

                    </div>

                </div>

            </div>
            
        </main>
        
        <VPopUp ref="addIndicatorContextMenu" :width="200">
            <VMenu class="col" :bordered="true" v-if="addIndicatorContextMenuInstance">
                <div class="py-2 justify-center items-center text-sm text-[#bbb] bg-[#1f1f1f] font-bold flex">
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
    import { AppStaticSettings } from "./api/data/AppStaticSettings";
    import { AppRoamingState } from "./api/data/AppRoamingState";

    import VMenu from './components/menu/VMenu.vue';
    import VMenuGroup from './components/menu/VMenuGroup.vue';
    import VMenuItem from './components/menu/VMenuItem.vue';
    import VCanvas3D from './components/rendering/VCanvas3D.vue';
    import { ElIcon } from "element-plus";
    import VPopUp from "./components/menu/VPopUp.vue";

    @Component({
        components: {
            VCanvas3D,
            VMenu,
            VMenuItem,
            VMenuGroup,
            VPopUp
        }
    })
    class VApp extends Vue
    {
        AppStaticSettings = AppStaticSettings;
        roamingState = AppRoamingState;

        addIndicatorContextMenuInstance: any = null;



        public async mounted(): Promise<void> {
            this.addIndicatorContextMenuInstance = this.$refs.addIndicatorContextMenu;
        }

        public addChart(): void {
            this.$roamingState.charts.push({
                id: crypto.randomUUID(),
                title: 'Untitled Chart',
                indicators: []
            });
        }
        
        public removeChart(chartId: string): void {
            this.$roamingState.charts = this.$roamingState.charts.filter(chart => chart.id !== chartId);
        }

        public addIndicator(chartId: string, indicatorTypeId: string): void {
            const chart = this.$roamingState.charts.find(chart => chart.id === chartId);
            if (chart) {
                chart.indicators.push({
                    id: `indicator${chart.indicators.length}`,
                    typeId: indicatorTypeId,
                    config: JSON.parse(JSON.stringify(this.$settings.indicators.find(ind => ind.typeId === indicatorTypeId)?.defaultConfig))
                });
            }
        }

        public removeIndicator(chartId: string, indicatorId: string): void {
            const chart = this.$roamingState.charts.find(chart => chart.id === chartId);
            if (chart) {
                chart.indicators = chart.indicators.filter(indicator => indicator.id !== indicatorId);
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
        background-color: #222;
    }

    .chart-indicator {
        border: 1px solid #333;
        border-radius: 4px;
    }

</style>
