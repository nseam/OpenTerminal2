<!-- TEMPLATE -->

<template>
    
    <div class="app col">
        
        <div class="app-header row-0 px-4 py-1 items-center">
            
            <h1 class="app-title">OPENTERMINAL</h1>
            
            <div class="row menu px-4 py-2">
                
                <VMenu>
                    <VMenuItem label="App" :topMenu="true" id="appMenuApplication">
                        
                        <template #content>
                            
                            <VMenuItem label="Save project" id="appMenuNewProject" @click="" :close="true" />

                            <VMenuItem label="Save project as..." id="appMenuNewProject" @click="" :close="true" />

                            <VMenuGroup />

                            <VMenuItem label="Import project..." id="appMenuImportProject" @click="" :close="true" />

                            <VMenuGroup />
                            
                            <VMenuItem label="Reload window" id="appMenuReload" @click="" :close="true"></VMenuItem>
                            
                            <VMenuGroup />
                            
                            <VMenuItem label="Exit" id="appMenuExit" @click="$api.appExit()" :close="true" />
                        </template>
                    </VMenuItem>

                    <VMenuItem label="Graphs" :topMenu="true" id="appMenuGraphs">
                        
                        <template #content>

                        </template>

                    </VMenuItem>

                </VMenu>
                
            </div>
            
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

    import VMenu from './components/menu/VMenu.vue';
    import VMenuGroup from './components/menu/VMenuGroup.vue';
    import VMenuItem from './components/menu/VMenuItem.vue';
    import VCanvas3D from './components/rendering/VCanvas3D.vue';

    @Component({
        components: {
            VCanvas3D,
            VMenu,
            VMenuItem,
            VMenuGroup
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
