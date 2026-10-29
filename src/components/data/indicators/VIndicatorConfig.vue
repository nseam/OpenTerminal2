<template>
    <div class="indicator-settings flex flex-0 flex-col">
        <div v-for="field in fields" :key="field.key" class="attribute">
            <div class="attribute-label">{{ field.label }}</div>

            <div class="attribute-value">
                <ElSelect v-if="field.options" v-model="roamingState.config[field.key]" :label="field.label">
                    <ElOption v-for="option in field.options" :key="option.value" :label="option.label" :value="option.value" />
                </ElSelect>
                <ElInputNumber v-else v-model="roamingState.config[field.key]" :min="field.min" :label="field.label" />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import { ElInputNumber, ElSelect, ElOption } from 'element-plus';

    type IndicatorField = {
        key: string;
        label: string;
        min?: number;
        options?: { label: string; value: string }[];
    };

    @Component({
        components: {
            ElInputNumber,
            ElSelect,
            ElOption
        }
    })
    class VIndicatorConfig extends Vue
    {
        @Prop({ required: true })
        public roamingState!: { typeId: string; config: Record<string, any> };

        public get fields(): IndicatorField[] {
            const appliedPrice = [
                { label: 'Open', value: 'open' },
                { label: 'High', value: 'high' },
                { label: 'Low', value: 'low' },
                { label: 'Close', value: 'close' }
            ];
            const maMethod = [
                { label: 'Simple', value: 'SMA' },
                { label: 'Exponential', value: 'EMA' },
                { label: 'Smoothed', value: 'SMMA' },
                { label: 'Linear Weighted', value: 'LWMA' }
            ];
            const shift = { key: 'shift', label: 'Shift', min: 0 };

            switch (this.roamingState.typeId) {
                case 'MACD':
                    return [
                        { key: 'ema_fast_period', label: 'Fast EMA Period', min: 1 },
                        { key: 'ema_slow_period', label: 'Slow EMA Period', min: 1 },
                        { key: 'signal_period', label: 'Signal Period', min: 1 },
                        { key: 'applied_price', label: 'Applied Price', options: appliedPrice },
                        shift
                    ];
                case 'Stochastic':
                    return [
                        { key: 'kperiod', label: 'K Period', min: 1 },
                        { key: 'dperiod', label: 'D Period', min: 1 },
                        { key: 'slowing', label: 'Slowing', min: 1 },
                        { key: 'ma_method', label: 'MA Method', options: maMethod },
                        { key: 'price_field', label: 'Price Field', options: [
                            { label: 'Low/High', value: 'LOWHIGH' },
                            { label: 'Close/Close', value: 'CLOSECLOSE' }
                        ] },
                        shift
                    ];
                case 'WPR':
                    return [{ key: 'period', label: 'Period', min: 1 }, shift];
                case 'Alligator':
                    return [
                        { key: 'jaw_period', label: 'Jaw Period', min: 1 },
                        { key: 'jaw_shift', label: 'Jaw Shift', min: 0 },
                        { key: 'teeth_period', label: 'Teeth Period', min: 1 },
                        { key: 'teeth_shift', label: 'Teeth Shift', min: 0 },
                        { key: 'lips_period', label: 'Lips Period', min: 1 },
                        { key: 'lips_shift', label: 'Lips Shift', min: 0 },
                        { key: 'ma_method', label: 'MA Method', options: maMethod },
                        { key: 'applied_price', label: 'Applied Price', options: appliedPrice },
                        shift
                    ];
                case 'Bands':
                    return [
                        { key: 'period', label: 'Period', min: 1 },
                        { key: 'deviation', label: 'Deviation', min: 0 },
                        { key: 'bshift', label: 'Band Shift', min: 0 },
                        { key: 'applied_price', label: 'Applied Price', options: appliedPrice },
                        shift
                    ];
                case 'Envelopes':
                    return [
                        { key: 'ma_period', label: 'MA Period', min: 1 },
                        { key: 'ma_shift', label: 'MA Shift', min: 0 },
                        { key: 'ma_method', label: 'MA Method', options: maMethod },
                        { key: 'applied_price', label: 'Applied Price', options: appliedPrice },
                        { key: 'deviation', label: 'Deviation', min: 0 },
                        shift
                    ];
                case 'Pivot':
                    return [
                        { key: 'method', label: 'Pivot Method', options: [
                            { label: 'Camarilla', value: 'CAMARILLA' },
                            { label: 'Classic', value: 'CLASSIC' },
                            { label: 'Fibonacci', value: 'FIBONACCI' },
                            { label: 'Woodie', value: 'WOODIE' }
                        ] },
                        shift
                    ];
                case 'SAR':
                    return [
                        { key: 'step', label: 'Step', min: 0 },
                        { key: 'max', label: 'Maximum', min: 0 },
                        shift
                    ];
                case 'Universal':
                    return [
                        { key: 'mode_1', label: 'Mode', min: 0 },
                        { key: 'shift_1', label: 'Source Shift', min: 0 },
                        shift
                    ];
                default:
                    return [];
            }
        }
    }

    export default toNative(VIndicatorConfig);
</script>

<style lang="scss" scoped>
</style>