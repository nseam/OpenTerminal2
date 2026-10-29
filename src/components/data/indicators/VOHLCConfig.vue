<!-- TEMPLATE -->

<template>

    <div class="indicator-settings-ohlc flex flex-0 flex-col">

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
    import { ElInputNumber, ElInput, ElSelect, ElOption } from 'element-plus';

    @Component({
        components: {
            ElInputNumber,
            ElInput,
            ElSelect,
            ElOption
        }
    })
    class VOHLCConfig extends Vue
    {
        @Prop({ required: true })
        public roamingState!: Object;

    }

    export default toNative(VOHLCConfig);

</script>


<!-- STYLE -->

<style lang="scss" scoped>


</style>
