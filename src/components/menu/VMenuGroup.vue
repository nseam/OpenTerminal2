<!-- TEMPLATE -->

<template>

  <div class="menu-group col">
    <ElDivider class="separator row !my-0" v-if="separator" :border-style="separatorStyle" :style="{ opacity: separatorOpacity }" :class="{ padded: separatorPadded }" />
    <div v-if="title" class="row pl-3 py-2 pb-1 justify-center text-[#ccc] font-semibold">{{ title }} </div>
  </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

  @Component()
  class VMenuGroup extends Vue
  {
    // Title of the group.
    @Prop({ type: String, default: '' })
    title!: string;

    // Whether to render a separator line below this item.
    @Prop({ type: Boolean, default: true })
    separator!: boolean;

    // Opacity of the separator line, from 0 to 1.
    @Prop({ type: Number, default: 1 })
    separatorOpacity!: number;

    // Style of the separator line as in CSS's "border-style" property, e.g. "solid", "dashed", "dotted", etc.
    @Prop({ type: String, default: 'solid' })
    separatorStyle!: string;

    // Whether to add horizontal padding to the separator so it stays within menu item padding.
    @Prop({ type: Boolean, default: false })
    separatorPadded!: boolean;
  }

  export default toNative(VMenuGroup);

</script>


<!-- STYLE -->

<style lang="scss">

  .menu-group {
    .separator.padded {
      width: auto;
      display: flex;
      //margin-left: 12px;
      //margin-right: 12px;
      opacity: 0.3 !important;
      border-width: 2px !important;
    }
  }

</style>
