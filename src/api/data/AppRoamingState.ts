import { reactive, watch } from "vue";

export interface AppRoamingStateChart {
    uuid: string;
    title: string;
    indicators: {
        uuid: string;
        typeId: string;
        config: any;
    }[];
}

export interface AppRoamingStateType {
    charts:  AppRoamingStateChart[];
}
export const AppRoamingState = reactive({
    charts: []
}) as AppRoamingStateType;

// Loading app roaming state from the local storage if available.
const savedState = localStorage.getItem('AppRoamingState');

if (savedState) {
    Object.assign(AppRoamingState, JSON.parse(savedState));
}

// Persisting app roaming state to the local storage whenever it changes.
watch(
    () => AppRoamingState,
    (newState: any) => {
        localStorage.setItem('AppRoamingState', JSON.stringify(newState));
    },
    { deep: true }
); 