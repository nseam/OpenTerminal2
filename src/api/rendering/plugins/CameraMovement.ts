import { RendererPlugin }          from "../RendererPlugin";
import { Known }                   from "@shared/api/Known";
import type { RendererRenderPass } from "../RendererRenderPass";
import * as Gfx from 'three';

// Options for the CameraMovement plugin.
export interface CameraMovementOptions {
    speed?: number;       // Speed of camera movement.
    rotationSpeed?: number; // Speed of camera rotation.
    zoomSpeed?: number;   // Speed of camera zoom.
    enableScrollZoom?: boolean; // Whether to enable zooming with the mouse wheel.
    enablePanning?: boolean; // Whether to enable panning with the middle mouse button.
}

/**
 * CameraMovement plugin allows for camera movement and rotation using keyboard and mouse input.
 * - W/A/S/D keys for forward/left/backward/right movement.
 * - Alt + Left Mouse Button for orbit-style rotation.
 * - Middle Mouse Button for panning in world-aligned X/Y axes.
 * - Alt + Both Mouse Buttons for orbit-style panning in camera local space.
 * - Mouse Wheel for zooming in/out.
 */
@Known.class('BuiltIn.CameraMovement')
export class CameraMovement extends RendererPlugin<CameraMovementOptions>
{
    // Whether the W/A/S/D keys are currently pressed.
    private keysPressed: Record<string, boolean> = {};

    // Whether the Alt key is currently pressed.
    private isAltPressed = false;

    // Whether the mouse is currently being dragged for camera rotation.
    private isDragging = false;

    // Whether the mouse is currently being dragged for camera panning.
    private lastMouseX = 0;

    // Last mouse Y position for panning.
    private lastMouseY = 0;

    // Whether the mouse is currently being dragged for camera panning.
    private isPanning = false;

    /**
     * Creates a new CameraMovement plugin instance.
     * @param rendererPass The render pass that this plugin is attached to.
     * @param options Optional configuration options for camera movement.
     */
    public constructor(rendererPass: RendererRenderPass, options?: CameraMovementOptions)
    {
        super(rendererPass, options);
    }

    /**
     * @inheritdoc
     */
    public override mounted(canvas: HTMLCanvasElement): void {
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
        canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));
        window.addEventListener('blur', this.handleBlur.bind(this));

        if (this.options?.enableScrollZoom)
            canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }

    /**
     * @inheritdoc
     */
    public override unmounted(canvas: HTMLCanvasElement): void {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        canvas.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        window.removeEventListener('blur', this.handleBlur);

        if (this.options?.enableScrollZoom)
            canvas.removeEventListener('wheel', this.handleWheel);
    }

    /**
     * @inheritdoc
     */
    public override update(renderPass: RendererRenderPass): void {
        this.moveCamera(renderPass);
    }

    /**
     * @inheritdoc
     */
    public override onChangeViewport(): void {
    }

    /**
     * Moves the camera based on the current keyboard input (W/A/S/D keys).
     * @param renderPass The current render pass being updated.
     */
    private moveCamera(renderPass: RendererRenderPass): void {
        if (!renderPass?.activeScene?.activeCamera)
            return;

        const camera = renderPass.activeScene.activeCamera;
        const dir = new Gfx.Vector3();

        if (this.keysPressed['w']) dir.z -= 1;
        if (this.keysPressed['s']) dir.z += 1;
        if (this.keysPressed['a']) dir.x -= 1;
        if (this.keysPressed['d']) dir.x += 1;
        if (this.keysPressed['q']) dir.y += 1;
        if (this.keysPressed['z']) dir.y -= 1;
        if (this.keysPressed['e']) dir.y -= 1;

        if (dir.lengthSq() > 0) {
            dir.normalize();
            const forward = new Gfx.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const right = new Gfx.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

            const movement = new Gfx.Vector3();
            movement.addScaledVector(forward, -dir.z);
            movement.addScaledVector(right, dir.x);
            movement.addScaledVector(new Gfx.Vector3(0, 1, 0), dir.y);
            movement.multiplyScalar(this.options?.speed ?? 0.03);
            camera.position.add(movement);
        }
    }

    /**
     * Handles the keydown event to track which keys are currently pressed.
     * @param e The keyboard event.
     */
    private handleKeyDown(e: KeyboardEvent): void {
        this.keysPressed[e.key.toLowerCase()] = true;
    }

    /**
     * Handles the keyup event to track which keys are no longer pressed.
     * @param e The keyboard event.
     */
    private handleKeyUp(e: KeyboardEvent): void {
        this.keysPressed[e.key.toLowerCase()] = false;
    }

    /**
     * Handles the blur event to reset the state of the camera movement.
     */
    private handleBlur(): void {
        this.keysPressed = {};
        this.isDragging = false;
        this.isAltPressed = false;
        this.isPanning = false;
    }

    /**
     * Handles the mousedown event to initiate camera movement.
     * @param e The mouse event.
     */
    private handleMouseDown(e: MouseEvent): void {
        if (e.altKey)
            this.isAltPressed = true;

        if (e.altKey && e.button === 0 || e.button === 2) {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            e.preventDefault();
        }

        if (e.button === 1) {
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            e.preventDefault();
        }
    }

    /**
     * Handles the mousemove event to update the camera's position and rotation based on mouse input.
     * @param e The mouse event.
     */
    private handleMouseMove(e: MouseEvent): void {
        const camera = this.camera;
        if (!camera)
            return;

        // Middle mouse button held: pan camera in world-aligned X/Y axes.
        if (this.options?.enablePanning && e.buttons & 4) {
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            const cam = camera.native;
            const viewW = this.rendererPass.renderer.native.domElement.clientWidth;
            const viewH = this.rendererPass.renderer.native.domElement.clientHeight;

            let worldPerPixelX = 1;
            let worldPerPixelY = 1;

            if (cam instanceof Gfx.OrthographicCamera) {
                worldPerPixelX = (cam.right - cam.left) / (viewW * cam.zoom);
                worldPerPixelY = (cam.top - cam.bottom) / (viewH * cam.zoom);
            }

            const right = new Gfx.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const up = new Gfx.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

            camera.position.addScaledVector(right, -deltaX * worldPerPixelX);
            camera.position.addScaledVector(up, deltaY * worldPerPixelY);

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            return;
        }

        // Alt + left/right mouse button: orbit-style rotation.
        if ((this.isAltPressed && this.isDragging) || e.buttons === 2) {
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            const yaw = -deltaX * (this.options?.rotationSpeed ?? 0.0027);
            const pitch = -deltaY * (this.options?.rotationSpeed ?? 0.0027);

            const euler = new Gfx.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
            euler.y += yaw;
            const PI_2 = Math.PI / 2;
            euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x + pitch));
            euler.z = 0;

            camera.quaternion.setFromEuler(euler);

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }

        // Alt + both mouse buttons held: orbit-style pan in camera local space.
        if (this.isAltPressed && e.buttons >= 3) {
            if (!this.isPanning) {
                this.isPanning = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                return;
            }

            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            const panSpeed = 0.01;
            const right = new Gfx.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const up = new Gfx.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

            camera.position.addScaledVector(right, -deltaX * panSpeed);
            camera.position.addScaledVector(up, deltaY * panSpeed);

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    /**
     * Handles the mouseup event to stop camera movement.
     * @param e The mouse event.
     */
    private handleMouseUp(e: MouseEvent): void {
        this.isPanning = false;
        this.isDragging = false;
        this.isAltPressed = false;
    }

    /**
     * Handles the mouse wheel event to zoom the camera in or out.
     * @param e The wheel event.
     */
    private handleWheel(e: WheelEvent): void {
        e.preventDefault();

        const camera = this.camera;
        if (!camera)
            return;

        let zoom = 1;
        if (e.deltaY < 0)
            zoom = Math.min(32, (this as any)._zoom * 2);
        else
            zoom = Math.max(0.1, (this as any)._zoom / 2);
        (this as any)._zoom = zoom;

        if (camera.native instanceof Gfx.OrthographicCamera) {
          // Adjust the zoom level for orthographic cameras.
            camera.native.zoom = zoom;
            camera.native.updateProjectionMatrix();
        }
        else if (camera.native instanceof Gfx.PerspectiveCamera) {
            // Adjust the camera's position for perspective cameras to simulate zooming.
            const forward = new Gfx.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
            const zoomAmount = e.deltaY * 0.01 * (this.options?.speed ?? 0.03) * 5;
            camera.position.addScaledVector(forward, zoomAmount);
        }
    }
}
