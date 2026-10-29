import { shallowReactive } from "vue";
import { type Chart } from "../rendering/objects/Chart";
import { type ChartGrid } from "../rendering/objects/ChartGrid";
import { type AppRoamingState } from "./AppRoamingState";
import { VApp } from "@/VApp.vue";
import { Runner } from "../tester/Runner";

export type AppLocalStateChart = {
    threejs: {
        chart: Chart;
        grid: ChartGrid;
    };
    runner: Runner;
};

export type AppLocalStateType = {
    charts: Record<string, AppLocalStateChart>;
    mounted(chart: Chart, grid: ChartGrid, chartConfig: any): void;
    unmounted(chartId: string): void;

};

// Storing local state for the application, e.g. Three.js Chart and ChartGrid objects.
export const AppLocalState = {

    /**
     * Reactive storage for all charts in the application.
     * 
     * Keyed by chart UUID.
     */
    charts: shallowReactive<AppLocalStateType["charts"]>({}),

    init(app: VApp, roamingState: typeof AppRoamingState) {
        // Mounting existing charts from the roaming state into the local state.
        for (const chartConfig of Object.values(roamingState.charts)) {
            app.addChart(chartConfig);
        }
    },

    /**
     * Mount a new chart and its corresponding grid into the local state.
     * 
     * @param chart The Three.js chart object to mount.
     * @param grid The Three.js chart grid object to mount.
     */
    mounted(chart: Chart, grid: ChartGrid, chartConfig: any) {
        this.charts[chart.uuid] = {
            threejs: {
                chart,
                grid
            },
            runner: new Runner(chart, chartConfig)
        };
    },

    unmounted(chartId: string) {
        delete this.charts[chartId];
    },

} as AppLocalStateType;
