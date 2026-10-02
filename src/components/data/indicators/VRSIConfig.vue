<!-- TEMPLATE -->

<template>

    <div class="indicator-settings-rsi flex flex-0 flex-col">

        <div class="attribute">
            <div class="attribute-label">
                RSI Period
            </div>

            <div class="attribute-value">
                <ElInput v-model="roamingState.config.period" label="Shift" />
            </div>
        </div>

        <div class="attribute">
            <div class="attribute-label">
                Applied Price
            </div>

            <div class="attribute-value">
                <ElSelect v-model="roamingState.config.applied_price" label="Applied Price">
                    <ElOption label="Close" value="close" />
                    <ElOption label="Open" value="open" />
                    <ElOption label="High" value="high" />
                    <ElOption label="Low" value="low" />
                </ElSelect>
            </div>
        </div>

        <div class="attribute">
            <div class="attribute-label">
                Shift
            </div>

            <div class="attribute-value">
                <ElInput v-model="roamingState.config.shift" label="Shift" />
            </div>
        </div>

    </div>

</template>


<!-- SCRIPT -->

<script lang="ts">
    import { ElInput, ElSelect, ElOption } from 'element-plus';

    @Component({
        components: {
            ElInput,
            ElSelect,
            ElOption
        }
    })
    class VRSIConfig extends Vue
    {
        @Prop({ required: true })
        public roamingState!: Object;

    }

    export default toNative(VRSIConfig);

</script>


<!-- STYLE -->

<style lang="scss" scoped>


</style>
