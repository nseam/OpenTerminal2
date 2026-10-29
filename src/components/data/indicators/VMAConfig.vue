<!-- TEMPLATE -->

<template>

    <div class="indicator-settings-ma flex flex-0 flex-col">

        <div class="attribute">
            <div class="attribute-label">
                MA Period
            </div>

            <div class="attribute-value">
                <ElInputNumber v-model="roamingState.config.period" :min="1" label="MA Period" />
            </div>
        </div>

        <div class="attribute">
            <div class="attribute-label">
                Applied Price
            </div>

            <div class="attribute-value">
                <ElSelect v-model="roamingState.config.applied_price" label="Applied Price">
                    <ElOption label="Open" value="open" />
                    <ElOption label="High" value="high" />
                    <ElOption label="Low" value="low" />
                    <ElOption label="Close" value="close" />
                </ElSelect>
            </div>
        </div>

        <div class="attribute">
            <div class="attribute-label">
                MA Shift
            </div>

            <div class="attribute-value">
                <ElInputNumber v-model="roamingState.config.ma_shift" :min="0" label="MA Shift" />
            </div>
        </div>

        <div class="attribute">
            <div class="attribute-label">
                MA Method
            </div>

            <div class="attribute-value">
                <ElSelect v-model="roamingState.config.ma_method" label="MA Method">
                    <ElOption label="Simple" value="SMA" />
                    <ElOption label="Exponential" value="EMA" />
                    <ElOption label="Smoothed" value="SMMA" />
                    <ElOption label="Linear Weighted" value="LWMA" />
                </ElSelect>
            </div>
        </div>

        <div class="attribute">
            <div class="attribute-label">
                Shift
            </div>

            <div class="attribute-value">
                <ElInputNumber v-model="roamingState.config.shift" :min="0" label="Shift" />
            </div>
        </div>

    </div>

</template>


<!-- SCRIPT -->

<script lang="ts">
    import { ElInputNumber, ElSelect, ElOption } from 'element-plus';

    @Component({
        components: {
            ElInputNumber,
            ElSelect,
            ElOption
        }
    })
    class VMAConfig extends Vue
    {
        @Prop({ required: true })
        public roamingState!: Object;

    }

    export default toNative(VMAConfig);

</script>


<!-- STYLE -->

<style lang="scss" scoped>


</style>