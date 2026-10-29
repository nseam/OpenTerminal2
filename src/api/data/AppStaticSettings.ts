import VRSIConfig from "../../components/data/indicators/VRSIConfig.vue";
import VMAConfig from "../../components/data/indicators/VMAConfig.vue";
import VOHLCConfig from "../../components/data/indicators/VOHLCConfig.vue";
import VIndicatorConfig from "../../components/data/indicators/VIndicatorConfig.vue";
import { type LibModule } from "fx31337-wasm/lib/Runner";
import { type IndicatorBase } from "fx31337-wasm/lib/types/Indicators/IndicatorBase";

export interface AppStaticSettingsType {
    indicators: {
        typeId: string;
        title: string;
        factory: (lib: LibModule, config: any) => IndicatorBase;
        ui: any;
        defaultConfig: any;
    }[];
}
export const AppStaticSettings = {
    indicators: [{
        typeId: 'RSI',
        title: 'RSI',
        factory: (lib: LibModule, config: any): IndicatorBase  =>
            new lib.indicators.RSI({ period: config.period, applied_price: lib.ap[config.applied_price as keyof typeof lib.ap], shift: config.shift }),
        ui: VRSIConfig,
        defaultConfig: {
            period: 14,
            applied_price: 'close',
            shift: 0
        },
    },
    {
        typeId: 'MA',
        title: 'MA',
        factory: (lib: LibModule, config: any): IndicatorBase =>
            new lib.indicators.MA({
                period: config.period,
                applied_price: lib.ap[config.applied_price as keyof typeof lib.ap],
                ma_shift: config.ma_shift,
                ma_method: lib.ma_methods[config.ma_method as keyof typeof lib.ma_methods],
                shift: config.shift
            }),
        ui: VMAConfig,
        defaultConfig: {
            period: 13,
            applied_price: 'open',
            ma_shift: 0,
            ma_method: 'SMA',
            shift: 10
        },
    },
    {
        typeId: 'OHLC',
        title: 'OHLC',
        factory (lib: LibModule, config: any): IndicatorBase {
            console.log(`Creating OHLC indicator with shift: ${config.shift}`);
            return new lib.indicators.OHLC({ shift: config.shift });
        },
        ui: VOHLCConfig,
        defaultConfig: {
            shift: 0
        },
    },
    {
        typeId: 'MACD',
        title: 'MACD',
        factory: (lib: LibModule, config: any): IndicatorBase =>
            new lib.indicators.MACD({
                ema_fast_period: config.ema_fast_period,
                ema_slow_period: config.ema_slow_period,
                signal_period: config.signal_period,
                applied_price: lib.ap[config.applied_price as keyof typeof lib.ap],
                shift: config.shift
            }),
        ui: VIndicatorConfig,
        defaultConfig: { ema_fast_period: 12, ema_slow_period: 26, signal_period: 9, applied_price: 'close', shift: 0 }
    },
    {
        typeId: 'Stochastic',
        title: 'Stochastic',
        factory: (lib: LibModule, config: any): IndicatorBase =>
            new lib.indicators.Stochastic({
                kperiod: config.kperiod,
                dperiod: config.dperiod,
                slowing: config.slowing,
                ma_method: lib.ma_methods[config.ma_method as keyof typeof lib.ma_methods],
                price_field: lib.sto_prices[config.price_field as keyof typeof lib.sto_prices],
                shift: config.shift
            }),
        ui: VIndicatorConfig,
        defaultConfig: { kperiod: 5, dperiod: 3, slowing: 3, ma_method: 'SMA', price_field: 'LOWHIGH', shift: 0 }
    },
    {
        typeId: 'WPR',
        title: 'WPR',
        factory: (lib: LibModule, config: any): IndicatorBase => new lib.indicators.WPR({ period: config.period, shift: config.shift }),
        ui: VIndicatorConfig,
        defaultConfig: { period: 14, shift: 0 }
    },
    {
        typeId: 'Alligator',
        title: 'Alligator',
        factory: (lib: LibModule, config: any): IndicatorBase =>
            new lib.indicators.Alligator({
                jaw_period: config.jaw_period, jaw_shift: config.jaw_shift,
                teeth_period: config.teeth_period, teeth_shift: config.teeth_shift,
                lips_period: config.lips_period, lips_shift: config.lips_shift,
                ma_method: lib.ma_methods[config.ma_method as keyof typeof lib.ma_methods],
                applied_price: lib.ap[config.applied_price as keyof typeof lib.ap], shift: config.shift
            }),
        ui: VIndicatorConfig,
        defaultConfig: { jaw_period: 13, jaw_shift: 8, teeth_period: 8, teeth_shift: 5, lips_period: 5, lips_shift: 3, ma_method: 'SMMA', applied_price: 'close', shift: 0 }
    },
    {
        typeId: 'Bands',
        title: 'Bands',
        factory: (lib: LibModule, config: any): IndicatorBase =>
            new lib.indicators.Bands({ period: config.period, deviation: config.deviation, bshift: config.bshift, applied_price: lib.ap[config.applied_price as keyof typeof lib.ap], shift: config.shift }),
        ui: VIndicatorConfig,
        defaultConfig: { period: 20, deviation: 2, bshift: 0, applied_price: 'open', shift: 0 }
    },
    {
        typeId: 'Envelopes',
        title: 'Envelopes',
        factory: (lib: LibModule, config: any): IndicatorBase =>
            new lib.indicators.Envelopes({ ma_period: config.ma_period, ma_shift: config.ma_shift, ma_method: lib.ma_methods[config.ma_method as keyof typeof lib.ma_methods], applied_price: lib.ap[config.applied_price as keyof typeof lib.ap], deviation: config.deviation, shift: config.shift }),
        ui: VIndicatorConfig,
        defaultConfig: { ma_period: 13, ma_shift: 0, ma_method: 'SMA', applied_price: 'open', deviation: 2, shift: 0 }
    },
    {
        typeId: 'Pivot',
        title: 'Pivot',
        factory: (lib: LibModule, config: any): IndicatorBase => new lib.indicators.Pivot({ method: lib.pivot_methods[config.method as keyof typeof lib.pivot_methods], shift: config.shift }),
        ui: VIndicatorConfig,
        defaultConfig: { method: 'CLASSIC', shift: 0 }
    },
    {
        typeId: 'SAR',
        title: 'SAR',
        factory: (lib: LibModule, config: any): IndicatorBase => new lib.indicators.SAR({ step: config.step, max: config.max, shift: config.shift }),
        ui: VIndicatorConfig,
        defaultConfig: { step: 0.02, max: 0.2, shift: 0 }
    },
    {
        typeId: 'Universal',
        title: 'Universal',
        factory: (lib: LibModule, config: any): IndicatorBase => new lib.indicators.Universal({ mode_1: config.mode_1, shift_1: config.shift_1, shift: config.shift }),
        ui: VIndicatorConfig,
        defaultConfig: { mode_1: 0, shift_1: 0, shift: 0 }
    }]
} as AppStaticSettingsType;
