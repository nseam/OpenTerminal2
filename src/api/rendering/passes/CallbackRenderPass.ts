import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { WebGLRenderer } from 'three';
import { Renderer } from '../Renderer';
import { Scene } from '../Scene';
import { Camera } from '../Camera';

/**
 * CallbackRenderPass extends RenderPass and allows injecting a user callback after the main render call.
 * The callback receives (time, frame) arguments, which are retrieved from the renderer if available.
 */
export class CallbackRenderPass extends RenderPass {
    private userCallback?: (time: DOMHighResTimeStamp, frame: XRFrame) => void;
    private baseRenderer: Renderer;
    private baseScene: Scene;
    private baseCamera: Camera;

    constructor(
        renderer: Renderer,
        scene: Scene,
        camera: Camera,
        userCallback?: (time: DOMHighResTimeStamp, frame: XRFrame) => void,
        overrideMaterial: any = null,
        clearColor: any = 0x000000,
        clearAlpha: number = 0
    )
    {
        super(scene, camera.native, overrideMaterial, clearColor, clearAlpha);

        this.baseRenderer = renderer;
        this.baseScene = scene;
        this.baseCamera = camera;
        this.userCallback = userCallback;
        this.clearColor = clearColor ?? this.clearColor;
        this.clearAlpha = clearAlpha ?? this.clearAlpha;
    }

    /**
     * Overrides the render method to call the user callback after rendering.
     * Attempts to retrieve time and XRFrame from the renderer if available.
     */
    render(
        renderer: WebGLRenderer,
        writeBuffer: any,
        readBuffer: any,
        deltaTime?: number,
        maskActive?: boolean
    )
    {
        // Call the base RenderPass render method with all arguments.
        super.render(renderer, writeBuffer, readBuffer, deltaTime ?? 0, maskActive ?? false);

        // Try to get XRFrame and time from renderer if possible.
        let time: DOMHighResTimeStamp = performance.now();
        let frame: XRFrame | null = null;
        // @ts-ignore
        if (renderer.xr && renderer.xr.getFrame) frame = renderer.xr.getFrame();
        if (typeof (renderer as any)._lastRenderTime === 'number')
            time = (renderer as any)._lastRenderTime;
        if (typeof (renderer as any)._lastXRFrame !== 'undefined')
            frame = (renderer as any)._lastXRFrame;

        this.userCallback?.(time, frame as XRFrame);
    }
}
