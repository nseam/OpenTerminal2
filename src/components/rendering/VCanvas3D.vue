<!-- TEMPLATE -->

<template>

    <div class="col relative h-full">
        <div ref="canvas" class="absolute top-0 left-0 w-full h-full canvas" @contextmenu.prevent></div>
        <!--
            <div class="attributes absolute top-0 right-0 w-[200px] h-full text-white p-3 pt-10">
            </div>
        -->
    </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

    import * as Gfx from 'three';
    import { Scene } from '../../api/rendering/Scene';
    import { CameraKind } from '../../api/rendering/CameraKind';
    import { Renderer } from '../../api/rendering/Renderer';
    import { Camera } from '../../api/rendering/Camera';
    import { Grid } from '../../api/rendering/Grid';
    import { ObjectPicker } from '../../api/rendering/plugins/ObjectPicker';
    import { PostProcessing } from '../../api/rendering/plugins/PostProcessing';
    import { CameraMovement } from '../../api/rendering/plugins/CameraMovement';
    import { FpsDisplay } from '../../api/rendering/plugins/FpsDisplay';
    import { markRaw, reactive, Reactive, shallowRef, triggerRef, type ShallowRef } from 'vue';
    import { RendererRenderPass } from '../../api/rendering/RendererRenderPass';

    import { TesterValues } from 'fx31337-wasm/lib/types/TesterValues.js';
    import { Bar } from '../../api/rendering/objects/Bar';
    import { ChartObjectManipulator } from '../../api/rendering/plugins/chart/ChartObjectManipulator';
    //import { ChartGridLabelsPlugin } from '../../api/rendering/plugins/chart/ChartGridLabelsPlugin';
    import { Chart } from '../../api/rendering/objects/Chart';
    import { Series } from '../../api/rendering/objects/Series';

    
    @Component({
        components: {

        },
        expose: ['scene', 'renderer'],
    })
    export class VCanvas3D extends Vue {

        @Ref
        canvas!: HTMLDivElement

        renderer!: Renderer;

        scene!: Scene;

        planeMaterial!: Gfx.MeshBasicMaterial;

        camera!: Camera;

        async mounted()
        {
            this.scene = markRaw(new Scene());

            this.camera = markRaw(new Camera(CameraKind.Perspective, 75, 0.1, 1000));

            // const camera = new Camera(CameraKind.Orthographic, 75, 0.1, 100);
            // Rotating camera 180 degrees around Y axis to look towards negative Z direction.
            // camera.position.x = 0;
            // camera.position.y = 0;
            // camera.position.z = 10;

            this.renderer = markRaw(new Renderer(this.canvas, { antialias: true }, this.scene));

            const light = new Gfx.DirectionalLight(0xffffff, 0.9);
            light.position.set(10, 2, 5);
            this.scene.add(light);

            const light2 = new Gfx.AmbientLight(0xffffff, 0.3);
            light2.position.set(2, 1, 5);
            this.scene.add(light2);

            const gridStep = 0.1;
            const gridSize = 16;

            //this.scene.add(new Grid(gridSize, gridSize / gridStep, 0, 0x337733, 0x151515));
            //this.scene.add(new Grid(gridSize, gridSize / gridStep / 10, 0, 0x337733, 0x333333));
            //this.scene.add(new Grid(gridSize, gridSize / gridStep / 100, 0, 0x337733, 0x336699));

            // Create a plane and apply the generated texture to it.
            const planeGeometry = new Gfx.PlaneGeometry(1, 1)
            this.planeMaterial = new Gfx.MeshBasicMaterial({
                map: null,
                side: Gfx.DoubleSide,
                dithering: true,
            });
            const plane = new Gfx.Mesh(planeGeometry, this.planeMaterial)
            plane.position.set(0, 0, 0);
            plane.scale.set(1, 1, 1);
            //this.scene.add(plane)

            this.scene.background = new Gfx.Color(0x000000);

            // Add lights so MeshLambertMaterial renders colored bars (not black).
            const ambientLight = new Gfx.AmbientLight(0xffffff, 0.6);
            this.scene.add(ambientLight);
            
            const dirLight = new Gfx.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(0, 5, 10);
            this.scene.add(dirLight);

            const rendererPass = this.renderer.addRenderPass({
                name: 'main',
                scene: this.scene,
                camera: this.camera,
                loop: (time: DOMHighResTimeStamp, frame: XRFrame) => {
                    
                }
            });

            rendererPass.clearColor = new Gfx.Color(0.1, 1, 0.1);
            rendererPass.clearAlpha = 1;

            rendererPass.addPlugin(PostProcessing, {
                ssaa: true,
                bloom: true,
            });

            rendererPass.addPlugin(ObjectPicker);
            rendererPass.addPlugin(ChartObjectManipulator);
            //rendererPass.addPlugin(ChartGridLabelsPlugin, {
            //    chart: chart,
            //});
            rendererPass.addPlugin(CameraMovement);
            rendererPass.addPlugin(FpsDisplay);

            /*
            const pointGeometry = new Gfx.BufferGeometry();
            const pointPositions = new Float32Array([2, 0, 0]); // Single point at origin
            pointGeometry.setAttribute('position', new Gfx.BufferAttribute(pointPositions, 3));
            const pointMaterial = new Gfx.PointsMaterial({ color: 0xff0000, size: 1 });
            const points = new Gfx.Points(pointGeometry, pointMaterial);
            this.scene.add(points);

            const raycaster = new Gfx.Raycaster();
            raycaster.params.Points.threshold = 0.2; // Adjust threshold for point picking
            const mouse = new Gfx.Vector2();

            this.renderer.domElement.addEventListener('mousemove', (event: MouseEvent) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, this.camera);
            const intersects = raycaster.intersectObject(points);

            if (intersects.length > 0) {
            console.log('Happy');
            }
            });

            */

            /*

            const controls = new TransformControls(this.camera, this.renderer.domElement);
            controls.attach(cube);
            // Set controls.size based on screen size to keep it visually consistent
            const baseSize = 0.75; // size for a reference height (e.g. 900px)
            const referenceHeight = 900;
            controls.size = baseSize / (height / referenceHeight);
            controls.translationSnap = 0.1;
            controls.rotationSnap = Math.PI / 180 * 15; // 15 degrees
            controls.mode = 'rotate';
            this.scene.add(controls.getHelper());

            */
        }

        // Handles drawing, erasing, or previewing a pixel at the mouse cursor position.
        // Draw mode: left button held or left click. Erase mode: right button held or right click.
        // Preview mode: no button held (hover). Skipped entirely when alt is pressed.
        // Returns true if a mesh was hit and a pixel operation was performed or previewed.
        handlePixelInteraction(e: MouseEvent): boolean {
            const isDrawing = e.buttons === 1 || (e.type === 'click' && e.button === 0);
            const isErasing = e.buttons === 2 || (e.type === 'click' && e.button === 2);

            const mainRendererPass = this.renderer.getRenderPass('main');
            const layersRendererPass = this.renderer.getRenderPass('layers');
            const objectPicker = layersRendererPass?.getPlugin(ObjectPicker);

            if (!objectPicker)
            return false;

            const viewportPos = this.renderer.clientToViewport(new Gfx.Vector2(e.clientX, e.clientY));
            const result = objectPicker.pick(mainRendererPass?.scene!, mainRendererPass?.camera!, viewportPos);
            const meshes = result?.filter(i => i.object instanceof Gfx.Mesh);

            if (!meshes?.length)
            return false;

            for (const mesh of meshes) {
                if (!mesh.uv)
                continue;

                const layerRect = new Gfx.Vector4();
                this.rootLayer.getRect(layerRect);
                const coords = new Gfx.Vector2(
                mesh.uv.x * layerRect.z - layerRect.x,
                mesh.uv.y * layerRect.w + layerRect.y,
                );

                if (isDrawing)
                this.rootLayer.drawPixel(TextureIndex.Diffuse, coords, new Gfx.Color(1, 0, 0), 1);
                else if (isErasing)
                this.rootLayer.clearPixel(TextureIndex.Diffuse, coords);
                else
                // No button held: show a preview pixel at hover position.
                this.rootLayer.drawPixel(TextureIndex.Diffuse, coords, new Gfx.Color(1, 0, 0), 1, true);

                return true;
            }

            return false;
        }

        beforeUnmount() {
            cancelAnimationFrame(this.animationId)
            this.renderer.native.dispose()
        }
    }

    export default toNative(VCanvas3D);

</script>

<!-- STYLE -->

<style scoped>

    .canvas {
        display: flex;
        flex: 1;
        background: #000;
        overflow: hidden;
    }

    .attributes {
        border: 3px solid #444;
        background: rgba(30, 30, 30, 0.8);
        backdrop-filter: blur(10px);
        min-height: 200px;
        border-radius: 5px;
        box-shadow: 0 0 1px 2px rgba(0, 0, 0, 0.8);
        margin-top: 40px;
        margin-right: 10px;
        padding: 0;
        height: auto;
    }

</style>

<style>

    canvas {
        width: 100% !important;
        height: 100% !important;
    }

    .chart-tooltip {
        position: absolute;
        padding: 4px;
        background: rgba(0, 0, 0, 0.8);
        font-size: 12px;
        color: #fff;
        border-radius: 5px;
        pointer-events: none;
        z-index: 1000;
    }

</style>
