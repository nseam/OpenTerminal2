import { RendererPlugin }          from "../RendererPlugin";
import { Known }                   from "@shared/api/Known";
import type { RendererRenderPass } from "../RendererRenderPass";

export interface FpsDisplayOptions {
    // Update interval in milliseconds (default: 300ms).
    interval?: number;
}

@Known.class('BuiltIn.FpsDisplay')
export class FpsDisplay extends RendererPlugin<FpsDisplayOptions>
{
    private fpsLabel: HTMLDivElement | null = null;
    private lastFpsUpdate: number = 0;
    private frameCount: number = 0;
    private interval: number = 300;

    /**
     * Constructor.
     */
    public constructor(rendererPass: RendererRenderPass, options?: FpsDisplayOptions)
    {
        super(rendererPass, options);

        if (options?.interval) {
            this.interval = options.interval;
        }
    }

    /**
     * @inheritdoc
     */
    public override update(renderPass: RendererRenderPass): void {
        this.updateFps();
    }

    /**
     * Updates the FPS display. This method is called on each update of the plugin. It calculates the FPS based on the number of frames rendered and the time elapsed since the last update, and updates the FPS label accordingly. The FPS label is created and styled on the first update, and then updated with the current FPS value at regular intervals defined by the `interval` property.
     */
    private updateFps(): void {
        // Create FPS label on first update
        if (!this.fpsLabel) {
            this.fpsLabel = document.createElement('div');
            this.fpsLabel.style.position = 'absolute';
            this.fpsLabel.style.top = '8px';
            this.fpsLabel.style.right = '16px';
            this.fpsLabel.style.color = '#fff';
            this.fpsLabel.style.background = 'rgba(0,200,0,0.5)';
            this.fpsLabel.style.padding = '2px 8px';
            this.fpsLabel.style.fontSize = '12px';
            this.fpsLabel.style.zIndex = '10';

            const canvasContainer = this.rendererPass.renderer.container;

            if (canvasContainer)
                canvasContainer.appendChild(this.fpsLabel);
        }

        // Increment frame count.
        this.frameCount++;

        const now = performance.now();

        // Update FPS every interval
        if (now - this.lastFpsUpdate > this.interval) {
            const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            this.fpsLabel.textContent = fps.toString();
            this.lastFpsUpdate = now;
            this.frameCount = 0;
        }
    }
}
