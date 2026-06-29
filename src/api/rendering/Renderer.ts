import * as Gfx                                          from 'three';
import { Scene }                                         from './Scene';
import { Camera }                                        from './Camera';
import { RendererPlugin }                                from "./RendererPlugin";
import { PostProcessing }                                from './plugins/PostProcessing';
import { Known }                                         from '@shared/api/Known';
import { render }                                        from 'vue';
import { RendererRenderPass, RendererRenderPassOptions } from './RendererRenderPass';

/**
 * Renderer class that extends THREE.WebGLRenderer to handle rendering scenes with plugins.
 */
@Known.class('BuiltIn.Renderer')
export class Renderer
{

    // Native WebGLRenderer instance used for rendering.
    public native: Gfx.WebGLRenderer;

    // List of render passes that will be executed in order.
    private renderPasses: RendererRenderPass[] = [];

    // Map of render passes by name for easy access.
    private renderPassesByName: Record<string, RendererRenderPass> = {};

    // Options used to create the WebGLRenderer instance.
    private options: Gfx.WebGLRendererParameters;

    // Container where the renderer's canvas will be appended.
    public container: HTMLDivElement | undefined;

    /**
     * Custom renderer class that extends THREE.WebGLRenderer
     */
    constructor(containerOrRenderer?: HTMLDivElement | Renderer | null, options: Gfx.WebGLRendererParameters | null = { antialias: true }, scene?: Scene, runAfter: boolean = false)
    {
        this.native = new Gfx.WebGLRenderer(options ?? {});
        this.options = options ?? {};

        if (containerOrRenderer instanceof HTMLDivElement)
            this.setContainer(containerOrRenderer);

        if (true)
            this.native.setAnimationLoop(this.animationLoop.bind(this));
        else {
            const animate = (time: DOMHighResTimeStamp) => {
                // XRFrame is not available here, so pass undefined.
                this.animationLoop(time, undefined as any);
                window.requestAnimationFrame(animate);
            };
            window.requestAnimationFrame(animate);
        }
    }

    /**
     * Adds a render pass at the specified order in the renderPasses array.
     * Order = 0 means the first render pass, order = 1 means the second render pass, etc.
     * To add a render pass at the end of the array, omit order parameter.
     */
    addRenderPass(options: RendererRenderPassOptions, order?: number): RendererRenderPass
    {
        const rendererPass = new RendererRenderPass(this, options);

        // Insert the render pass into the array at the specified order.
        if (typeof order === 'number')
            this.renderPasses.splice(order, 0, rendererPass);
        else
            this.renderPasses.push(rendererPass);

        if (options.name)
            this.renderPassesByName[options.name] = rendererPass;

        return rendererPass;
    }

    /**
     * Retrieves a render pass by its name.
     */
    getRenderPass(name: string): RendererRenderPass | undefined {
        return this.renderPassesByName[name];
    }

    /**
     * Animation loop for the renderer. Renders all registered render passes.
     */
    animationLoop (time: DOMHighResTimeStamp, frame: XRFrame): void
    {
        if (this.container)
            this.update(this.container, time, frame);
    }

    clientToViewport(client: Gfx.Vector2): Gfx.Vector2
    {
        if (!this.container)
            throw new Error('Container is not set. Please set the container before using clientToViewport.');

        // Convert client coordinates to normalized viewport coordinates between 0 and 1.0.
        const rect = this.container.getBoundingClientRect();
        const x = (client.x - rect.left) / rect.width * 2 - 1;
        const y = 1 - ((client.y - rect.top) / rect.height * 2);

        return new Gfx.Vector2(x, y);
    }

    setContainer(container: HTMLDivElement): void
    {
        container.style.position = 'relative';

        // Remove any existing <canvas> elements from the container except this.domElement and check if domElement is present.
        let found = false;

        for (let child = container.firstChild; child; )
        {

            if (child instanceof HTMLCanvasElement)
            {
                if (child === this.native.domElement)
                    found = true;
                else
                {
                    container.removeChild(child);
                    break;
                }
            }

            child = child.nextSibling;
        }

        if (!found)
            container.appendChild(this.native.domElement);

        // Disabling context menu on right click for the canvas to prevent default browser context menu.
        this.native.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.container = container;
    }

    /**
     * Updates the renderer with canvas size. Also sets the pixel ratio.
     */
    update(container: HTMLDivElement, time: DOMHighResTimeStamp, frame: XRFrame): void
    {
        this.setContainer(container);

        // Update the renderer size based on the canvas dimensions.
        this.native.setSize(container.clientWidth, container.clientHeight, false);
        this.native.setPixelRatio(window.devicePixelRatio);

        for (const pass of this.renderPasses)
        {
            if (!pass.activeScene || !pass.camera)
                continue;

            pass.activeScene.update(this);

            pass.beforeRender?.(pass, this, pass.activeScene, pass.camera);

            let alreadyRendered = false;

            // Search for PostProcessing plugin, if found, call its update() method. If no found, use this.render() method.
            for (const key in pass.plugins)
            {
                if (pass.plugins[key] instanceof PostProcessing) {
                    // PostProcessing plugin found, rendering with post-processing.
                    pass.plugins[key].update(pass);
                    // Exit after the first plugin that handles rendering.
                    alreadyRendered = true;
                    break;
                }
            }

            if (!alreadyRendered && pass.activeScene && pass.camera) {
                // Updating plugins that don't handle rendering, e.g. ObjectPicker, FpsDisplay, etc.
                for (const key in pass.plugins)
                    pass.plugins[key].update(pass);

                this.native.render(pass.activeScene, pass.camera.native);
            }
        }
    }
}
