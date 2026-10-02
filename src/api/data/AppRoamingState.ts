import { reactive } from "vue";

export const AppRoamingState = reactive({
    charts: [{
        id: crypto.randomUUID(),
        title: 'Untitled Chart',
        indicators: [
        ]
    }]
});
