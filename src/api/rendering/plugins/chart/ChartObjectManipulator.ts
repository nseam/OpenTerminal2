import { RendererPlugin }          from "../../RendererPlugin";
import { Known }                   from "@shared/api/Known";
import type { RendererRenderPass } from "../../RendererRenderPass";
import * as Gfx from 'three';
import { ObjectPicker } from "../ObjectPicker";
import { Series } from "../../objects/Series";
import { Chart } from "../../objects/Chart";

type ChartHit = {
    series: Series;
    target: { kind: 'bar'; barIndex: number } | { kind: 'point'; barIndex: number; valueIndex: number };
};

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

    private _chartPickObjects: Gfx.Object3D[] = [];

    private _hoveredTarget: ChartHit | null = null;

    private _selectedTarget: ChartHit | null = null;

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
        this._chart.numBarsVisible = this._chart.numInitialBars;
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
        if (!this.camera)
            return;

        const bbox = this._chart.getBBox();
        this.camera.position.set((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, 1.2);
        this.camera.lookAt((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, 2);
    }

    // Re-applies _selectedGlobalBarIndex to the current bar window after a scroll.
    private _restoreSelection(): void {
        // @todo
        return;

        for (const child of this.scene?.children ?? []) {
            if (!(child instanceof Chart)) continue;
            for (const series of child.bars) {
                for (let b = 0; b < series.chart.numBars; b++) {
                    const globalIdx = child.scrollX + b;
                    series.bars[b].selected = (globalIdx === this._selectedGlobalBarIndex);
                }
                series.updateColors();
            }
        }
    }

    private resetAllBarStates(): void {
        // @todo
        return;

        for (const child of this.scene?.children ?? []) {
            if (child instanceof Series) {
                for (const bar of child.bars) {
                    bar.selected = false;
                    bar.hovered = false;
                }
                child.updateColors();
            } else if (child instanceof Chart) {
                for (const series of child.bars) {
                    for (const bar of series.bars) {
                        bar.selected = false;
                        bar.hovered = false;
                    }
                    series.updateColors();
                }
            }
        }
    }

    /** Clears the previously hovered chart target. */
    private resetHoverStates(): void {
        const previous = this._hoveredTarget;
        this._hoveredTarget = null;
        if (!previous)
            return;

        if (previous.target.kind === 'bar') {
            const bar = previous.series.bars[previous.target.barIndex];
            if (bar) {
                bar.hovered = false;
                previous.series.updateBarColor(previous.target.barIndex);
            }
        } else {
            const bar = previous.series.bars[previous.target.barIndex];
            if (bar)
                bar.hovered = false;
            previous.series.setHoveredValue(-1, -1);
        }
    }

    /**
     * Resets all bar selection states across every series in the scene.
     * Must be called before a selection pick operation to ensure a clean slate.
     */
    private resetSelectionStates(): void {
        const previous = this._selectedTarget;
        this._selectedTarget = null;
        if (previous) {
            if (previous.target.kind === 'bar') {
                const bar = previous.series.bars[previous.target.barIndex];
                if (bar) {
                    bar.selected = false;
                    previous.series.updateBarColor(previous.target.barIndex);
                }
            } else {
                previous.series.setSelectedValue(-1, -1);
            }
        }
        this._selectedGlobalBarIndex = -1;
    }

    private findChartHit(objectPicker: ObjectPicker, viewportPosition: Gfx.Vector2): ChartHit | null {
        if (!this.scene || !this.camera)
            return null;

        const pickObjects = this._chartPickObjects;
        pickObjects.length = 0;
        for (const series of this._chart.series)
            series.addPickableMeshes(pickObjects);

        const intersections = objectPicker.pick(this.scene, this.camera, viewportPosition, Gfx.InstancedMesh, pickObjects) ?? [];

        for (const hit of intersections) {
            if (!(hit.object instanceof Gfx.InstancedMesh) || hit.instanceId === undefined)
                continue;

            const parent = hit.object.parent;
            if (!(parent instanceof Series))
                continue;

            const target = parent.resolvePickTarget(hit.object, hit.instanceId);
            if (target)
                return { series: parent, target };
        }

        return null;
    }

    private isSameTarget(first: ChartHit | null, second: ChartHit | null): boolean {
        if (!first || !second || first.series !== second.series || first.target.kind !== second.target.kind ||
            first.target.barIndex !== second.target.barIndex)
            return false;

        return first.target.kind === 'bar' ||
            (second.target.kind === 'point' && first.target.valueIndex === second.target.valueIndex);
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
            // Resetting camera position and rotation to default.
            this._centerCameraOnChart();
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
                const hit = this.findChartHit(objectPicker, viewportPosition);
                const wasSelected = this.isSameTarget(hit, this._selectedTarget);

                this.resetSelectionStates();


                if (hit && !wasSelected) {
                    this._selectedTarget = hit;
                    if (hit.target.kind === 'bar') {
                        hit.series.bars[hit.target.barIndex].selected = true;
                        this._selectedGlobalBarIndex = this._chart.scrollX + hit.target.barIndex;
                        hit.series.updateBarColor(hit.target.barIndex);
                    } else {
                        hit.series.setSelectedValue(hit.target.barIndex, hit.target.valueIndex);
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
            this._chart.scrollBy(0, e.movementY * -0.002);
            this._restoreSelection();
        }
        else if (objectPicker) {
            this.resetHoverStates();

            const hit = this.findChartHit(objectPicker, viewportPosition);
            if (hit?.target.kind === 'bar') {
                hit.series.bars[hit.target.barIndex].hovered = true;
                hit.series.updateBarColor(hit.target.barIndex);
                this._hoveredTarget = hit;
            } else if (hit?.target.kind === 'point') {
                const bar = hit.series.bars[hit.target.barIndex];
                if (bar)
                    bar.hovered = true;
                hit.series.setHoveredValue(hit.target.barIndex, hit.target.valueIndex);
                this._hoveredTarget = hit;
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
            this._chart.scrollBy(e.deltaY * -0.002, 0);
        }
        e.preventDefault();
    }
}
