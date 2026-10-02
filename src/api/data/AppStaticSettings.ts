import VRSIConfig from "../../components/data/indicators/VRSIConfig.vue";
import { type LibModule } from "fx31337-wasm/lib/Runner";
import { type IndicatorBase } from "fx31337-wasm/lib/types/Indicators/IndicatorBase";

export const AppStaticSettings = {
    indicators: [{
        typeId: 'RSI',
        title: 'RSI',
        factory: (lib: LibModule, config: any): IndicatorBase  => {
            const indicator = new lib.indicators.RSI({ period: config.period, applied_price: lib.ap[config.applied_price], shift: config.shift });
            return indicator;
        },
        ui: VRSIConfig,
        defaultConfig: {
            period: 14,
            applied_price: 'close',
            shift: 0
        },
    }]
};
