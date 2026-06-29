import type { Camera } from "./Camera";
import type { Renderer } from "./Renderer";
import type { RendererRenderPass } from "./RendererRenderPass";
import type { Scene } from "./Scene";

export class RendererPluginBase
{
    public readonly renderer: Renderer;
    public readonly rendererPass: RendererRenderPass;
    protected scene: Scene | undefined;
    protected camera: Camera | undefined;

    constructor(rendererPass: RendererRenderPass)
    {
        this.renderer = rendererPass.renderer;
        this.rendererPass = rendererPass;
    }

    /**
     * Called when the plugin is mounted to the renderer. Sets up event listeners for keyboard and mouse input.
     * @param canvas The canvas element that the renderer is using.
     */
    public mounted(canvas: HTMLCanvasElement): void {
    }

    /**
     * Called when the plugin is unmounted from the renderer. Removes event listeners for keyboard and mouse input.
     * @param canvas The canvas element that the renderer is using.
     */
    public unmounted(canvas: HTMLCanvasElement): void {
    }

    /**
     * Called on each update of the render pass. Moves the camera based on keyboard input.
     * @param renderPass The current render pass being updated.
     */
    public update(renderPass: RendererRenderPass): void {
    }

    /**
     * Called when the viewport changes.
     */
    public onChangeViewport(): void {
    }
}

