<!-- TEMPLATE -->

<template>

  <div class="shortcut flex flex-row">
    
  </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

  @Component()
  class VShortcut extends Vue
  {
    // Whether Alt key is needed.
    @Prop({ type: Boolean, default: false })
    alt!: boolean;

    // Whether Shift key is needed.
    @Prop({ type: Boolean, default: false })
    shift!: boolean;

    // Whether Ctrl key is needed.
    @Prop({ type: Boolean, default: false })
    ctrl!: boolean;

    // Key to be pressed.
    @Prop({ type: String, default: '' })
    char!: string;

    // Mouse button to be pressed.
    @Prop({ type: Number, default: 0 })
    mouseButton!: number;
  }

  export default toNative(VShortcut);

</script>


<!-- STYLE -->

<style lang="scss" scoped>


</style>
