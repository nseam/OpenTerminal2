<!-- TEMPLATE -->

<template>

  <div class="app col">

    <div class="app-header row-0">
      <h1 class="app-title">OpenTerminal</h1>
    </div>

    <main class="app-content col">

      <div class="col">

        <div class="col">

          <VCanvas3D />

        </div>

      </div>

    </main>

  </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

  import VCanvas3D from './components/rendering/VCanvas3D.vue';

  @Component({
    components: {
      VCanvas3D
    }
  })
  class VApp extends Vue
  {

  }

  export default toNative(VApp);

</script>


<!-- STYLE -->

<style lang="scss" scoped>

  .app {
    height: 100vh;
    max-height: 100vh;
    overflow: hidden;
    background-color: #000;
    color: #d4d4d4;
  }

  .app-header {
    padding: 16px 16px;
  }

  .app-title {
    font-size: 16px;
    font-weight: 700;
    color: #999;
  }

  .app-content {
    overflow: hidden;
  }

</style>
