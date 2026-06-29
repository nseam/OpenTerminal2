import { SSAARenderPass } from 'three/examples/jsm/postprocessing/SSAARenderPass.js';
import { type WebGLRenderer, type Scene, Color, WebGLRenderTarget } from 'three';
import { Renderer } from '../Renderer';
import { Camera } from '../Camera';

/**
 * CallbackSSAARenderPass extends SSAARenderPass and allows injecting a user callback after the main render call.
 * The callback receives (time, frame) arguments, which are retrieved from the renderer if available.
 */
export class CallbackSSAARenderPass extends SSAARenderPass {
    private userCallback: (time: DOMHighResTimeStamp, frame: XRFrame) => void;
    private baseRenderer: Renderer;
    private baseScene: Scene;
    private baseCamera: Camera;

    constructor(
        renderer: Renderer,
        scene: Scene,
        camera: Camera,
        userCallback: (time: DOMHighResTimeStamp, frame: XRFrame) => void,
        overrideMaterial: any = null,
        clearColor: any = 0x000000,
        clearAlpha: number = 0

    )
    {
        super(scene, camera.native, new Color(clearColor), clearAlpha);

        this.baseRenderer = renderer;
        this.baseScene = scene;
        this.baseCamera = camera;
        this.userCallback = userCallback;
        this.clear = true;
    }

    /**
     * Overrides the render method to call the user callback after rendering.
     * Attempts to retrieve time and XRFrame from the renderer if available.
     */
    render(
        renderer: WebGLRenderer,
        writeBuffer: WebGLRenderTarget,
        readBuffer: WebGLRenderTarget,
        deltaTime?: number,
        maskActive?: boolean
    )
    {
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

        if (this.userCallback)
            this.userCallback(time, frame as XRFrame);
    }
}
