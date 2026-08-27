import { RendererPlugin }          from "../../RendererPlugin";
import { Known }                   from "@shared/api/Known";
import type { RendererRenderPass } from "../../RendererRenderPass";
import * as Gfx from 'three';
import { ObjectPicker } from "../ObjectPicker";
import { Series } from "../../objects/Series";
import { Chart } from "../../objects/Chart";

// Options for the ChartObjectManipulator plugin.
export interface ChartObjectManipulatorOptions {
    chart: Chart;
}

/**
 * CameraMovement plugin allows for camera movement and rotation using keyboard and mouse input.
 * - W/A/S/D keys for forward/left/backward/right movement.
 * - Alt + Left Mouse Button for orbit-style rotation.
 * - Middle Mouse Button for panning in world-aligned X/Y axes.
 * - Alt + Both Mouse Buttons for orbit-style panning in camera local space.
 * - Mouse Wheel for zooming in/out.
 */
@Known.class('BuiltIn.ChartObjectManipulator')
export class ChartObjectManipulator extends RendererPlugin<ChartObjectManipulatorOptions>
{
    // Which keys are currently pressed.
    private keysPressed: Record<string, boolean> = {};

    // Whether the Alt key is currently pressed.
    private isAltPressed = false;

    // Whether the Shift key is currently pressed.
    private isShiftPressed = false;

    // Whether the mouse is currently being dragged for object manipulation.
    private isDragging = false;

    // Last mouse X position for panning/scaling.
    private lastMouseX = 0;

    // Last mouse Y position for panning/scaling.
    private lastMouseY = 0;

    // Whether the mouse is currently being dragged for camera panning.
    private isPanning = false;

    // Whether the mouse is currently being dragged for chart scrolling.
    private isScrolling = false;

    // Accumulated horizontal scroll velocity for smooth mouse-wheel deceleration.
    private _scrollVelocity: number = 0;

    // Vector2 cache.
    private _cacheVector2: Gfx.Vector2 = new Gfx.Vector2();

    // The chart object that this manipulator is currently interacting with.
    private _chart: Chart;

    // Global bar index (barsStartIndex + series-local index) of the selected bar, or -1 if none.
    private _selectedGlobalBarIndex: number = -1;

    /**
     * Creates a new ChartObjectManipulator plugin.
     * @param rendererPass The render pass that this plugin is attached to.
     * @param options Optional configuration options for chart object manipulation.
     */
    public constructor(rendererPass: RendererRenderPass, options: ChartObjectManipulatorOptions)
    {
        super(rendererPass, options);

        this._chart = options.chart;
        this._chart.onDataSet = () => this._centerCameraOnChart();
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
        canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this._centerCameraOnChart();
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
        canvas.removeEventListener('wheel', this.handleWheel);
    }

    /**
     * @inheritdoc
     */
    public override update(renderPass: RendererRenderPass): void {
        // Apply smooth scroll: advance chart by current velocity then decay.
        if (Math.abs(this._scrollVelocity) > 0.00001) {
            this._chart.scrollByPixels(this._scrollVelocity, 0);
            this._scrollVelocity *= 0.90;
            this._restoreSelection();
        } else if (this._scrollVelocity !== 0) {
            this._scrollVelocity = 0;
            this._chart.snapToNearestBar();
        }

    }

    /**
     * @inheritdoc
     */
    public override onChangeViewport(): void {
    }

    /**
     * Resets all bar hover and selection states across every series in the scene.
     * Must be called before any pick operation to ensure only one bar is highlighted at a time.
     */
    private _centerCameraOnChart(): void {
        if (!this.camera) return;
        const bbox = this._chart.getBBox();
        this.camera.position.set((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, 1);
        this.camera.lookAt((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, 1);
    }

    // Re-applies _selectedGlobalBarIndex to the current bar window after a scroll.
    private _restoreSelection(): void {
        for (const child of this.scene?.children ?? []) {
            if (!(child instanceof Chart)) continue;
            for (const series of child.series) {
                for (let b = 0; b < series.getNumBars(); b++) {
                    const globalIdx = child.barsStartIndex + b;
                    series.bars[b].selected = (globalIdx === this._selectedGlobalBarIndex);
                }
                series.updateColors();
            }
        }
    }

    private resetAllBarStates(): void {
        for (const child of this.scene?.children ?? []) {
            if (child instanceof Series) {
                for (const bar of child.bars) {
                    bar.selected = false;
                    bar.hovered = false;
                }
                child.updateColors();
            } else if (child instanceof Chart) {
                for (const series of child.series) {
                    for (const bar of series.bars) {
                        bar.selected = false;
                        bar.hovered = false;
                    }
                    series.updateColors();
                }
            }
        }
    }

    /**
     * Resets all bar hover states across every series in the scene.
     * Must be called before a hover pick operation to ensure only one bar is hovered.
     */
    private resetHoverStates(): void {
        for (const child of this.scene?.children ?? []) {
            if (child instanceof Series) {
                for (const bar of child.bars) {
                    bar.hovered = false;
                }
                // Update GPU colors immediately so stale hover highlights are cleared.
                child.updateColors();
            } else if (child instanceof Chart) {
                for (const series of child.series) {
                    for (const bar of series.bars) {
                        bar.hovered = false;
                    }
                    series.updateColors();
                }
            }
        }
    }

    /**
     * Resets all bar selection states across every series in the scene.
     * Must be called before a selection pick operation to ensure a clean slate.
     */
    private resetSelectionStates(): void {
        for (const child of this.scene?.children ?? []) {
            if (child instanceof Series) {
                for (const bar of child.bars) {
                    bar.selected = false;
                }
                // Update GPU colors immediately so stale selection highlights are cleared.
                child.updateColors();
            } else if (child instanceof Chart) {
                for (const series of child.series) {
                    for (const bar of series.bars) {
                        bar.selected = false;
                    }
                    series.updateColors();
                }
            }
        }
    }

    /**
     * Handles the keydown event to track which keys are currently pressed.
     * @param e The keyboard event.
     */
    private handleKeyDown(e: KeyboardEvent): void {
        this.keysPressed[e.key.toLowerCase()] = true;

        if (e.shiftKey)
            this.isShiftPressed = true;

        if (e.altKey)
            this.isAltPressed = true;

        if (e.key === '-' || e.key === '+' || e.key === '=') {
            // Changing chart zoom.
            const zoomFactor = e.key === '+' || e.key === '=' ? 2 : 0.5;

            const newZoom = this._chart.zoom * zoomFactor;

            // Zoom could be clamped to a reasonable range if desired, e.g.:
            this._chart.zoom = Math.max(1 / 256, Math.min(newZoom, 1));
        }
        else if (e.key === '0') {
            this._chart.zoom = 1;
        }
        else if (e.key === 'Home') {
            // Reseting camera position and rotation to default.
            if (this.camera) {
                // Centering camera on the chart but from the behind.
                const bbox = this._chart.getBBox();
                this.camera.position.set((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, 1);
                this.camera.lookAt((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, 1);
    
            }
        }
    }

    /**
     * Handles the keyup event to track which keys are no longer pressed.
     * @param e The keyboard event.
     */
    private handleKeyUp(e: KeyboardEvent): void {
        this.keysPressed[e.key.toLowerCase()] = false;

        if (!e.shiftKey)
            this.isShiftPressed = false;

        if (!e.altKey)
            this.isAltPressed = false;
    }

    /**
     * Handles the blur event to reset the state of the camera movement.
     */
    private handleBlur(): void {
        this.keysPressed = {};
        this.isDragging = false;
        this.isAltPressed = false;
        this.isShiftPressed = false;
        this.isPanning = false;
    }

    /**
     * Handles the mousedown event to initiate camera movement.
     * @param e The mouse event.
     */
    private handleMouseDown(e: MouseEvent): void {
        if (e.altKey && e.button === 0 || e.button === 2) {
            this.isDragging = true;
            this.lastMouseX = e.offsetX;
            this.lastMouseY = e.offsetY;
            e.preventDefault();
        }
        else
        if (e.button === 0) {
            this.isScrolling = true;
            this.lastMouseX = e.offsetX;
            this.lastMouseY = e.offsetY;
            e.preventDefault();
        }


        // Using ObjectPicker plugin to pick objects in the scene when the left mouse button is clicked without Alt key.
        if (!e.altKey && e.button === 0) {
            const objectPicker = this.rendererPass.getPlugin(ObjectPicker);

            this._cacheVector2.set(e.clientX, e.clientY);
            const viewportPosition = this.renderer.clientToViewport(this._cacheVector2);

            if (objectPicker) {
                // Reset selection states only — hover is independent.
                this.resetSelectionStates();

                // Pick against InstancedMesh directly.
                const raycaster = new Gfx.Raycaster();
                raycaster.setFromCamera(viewportPosition, this.camera!.native);
                const intersects = raycaster.intersectObjects(this.scene?.children ?? [], true);

                if (intersects && intersects.length > 0) {
                    for (const hit of intersects) {
                        if (!(hit.object instanceof Gfx.InstancedMesh))
                            continue;

                        const instanceId = hit.instanceId;

                        if (instanceId === undefined || instanceId < 0)
                            continue;

                        let parent: Gfx.Object3D | null = hit.object;

                        while (parent) {
                            if (parent instanceof Series) {
                                const bar = parent.bars[instanceId];
                                if (bar) {
                                    const globalIdx = this._chart.barsStartIndex + instanceId;
                                    if (bar.selected) {
                                        bar.selected = false;
                                        this._selectedGlobalBarIndex = -1;
                                    } else {
                                        bar.selected = true;
                                        this._selectedGlobalBarIndex = globalIdx;
                                    }
                                    parent.updateColors();
                                }
                                return;
                            }
                            parent = parent.parent;
                        }
                    }
                }
            }
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


        this.lastMouseX = e.offsetX;
        this.lastMouseY = e.offsetY;

        const objectPicker = this.rendererPass.getPlugin(ObjectPicker);

        this._cacheVector2.set(e.clientX, e.clientY);
        const viewportPosition = this.renderer.clientToViewport(this._cacheVector2);

        if (this.isScrolling) {
            console.log(`Scrolling chart by pixels: (${e.movementX}, ${e.movementY})`);
            this._chart.scrollByPixels(0, e.movementY * -0.002);
            this._restoreSelection();
        }
        else if (objectPicker) {
            // Reset all hover states before picking to ensure only one bar is hovered.
            this.resetHoverStates();

            // Pick against InstancedMesh directly.
            const raycaster = new Gfx.Raycaster();
            raycaster.setFromCamera(viewportPosition, this.camera!.native);
            const intersects = raycaster.intersectObjects(this.scene?.children ?? [], true);

            if (intersects && intersects.length > 0) {
                for (const hit of intersects) {
                    // Only accept intersections from an InstancedMesh with a valid instanceId.
                    if (!(hit.object instanceof Gfx.InstancedMesh)) continue;
                    const instanceId = hit.instanceId;
                    if (instanceId === undefined || instanceId < 0) continue;

                    // Walk up to find parent Series.
                    let parent: Gfx.Object3D | null = hit.object;
                    while (parent) {
                        if (parent instanceof Series) {
                            const bar = parent.bars[instanceId];
                            if (bar) {
                                bar.hovered = true;
                                parent.updateColors(); // Refresh colors on GPU.
                            }
                            return;
                        }
                        parent = parent.parent;
                    }
                }
            }
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
        this.isScrolling = false;
    }

    /**
     * Handles the mouse wheel event to zoom the camera in or out.
     * @param e The wheel event.
     */
    private handleWheel(e: WheelEvent): void {
        if (e.deltaY !== 0) {
            this._scrollVelocity += e.deltaY * -0.001;
        }
        e.preventDefault();
    }
}
