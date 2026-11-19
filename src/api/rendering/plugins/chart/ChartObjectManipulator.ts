import { RendererPlugin }          from "../../RendererPlugin";
import { Known }                   from "@shared/api/Known";
import type { RendererRenderPass } from "../../RendererRenderPass";
import * as Gfx from 'three';
import { ObjectPicker } from "../ObjectPicker";
import { Series } from "../../objects/Series";
import { Chart } from "../../objects/Chart";
import { isUiBlockingInput } from "../../isUiBlockingInput";

type ChartHit = {
    series: Series;
    target: { kind: 'bar'; barIndex: number } | { kind: 'point'; barIndex: number; valueIndex: number };
};

// Options for the ChartObjectManipulator plugin.
export interface ChartObjectManipulatorOptions {
    chart?: Chart;
}

/**
 * CameraMovement plugin allows for camera movement and rotation using keyboard and mouse input.
 * - W/A/S/D keys for forward/left/backward/right movement.
 * - Alt + Left Mouse Button for orbit-style rotation.
 * - Middle Mouse Button for panning in world-aligned X/Y axes.
 * - Alt + Both Mouse Buttons for orbit-style panning in camera local space.
 * - Left Mouse Button drag for scrolling the chart horizontally and vertically.
 * - Mouse Wheel for zooming the chart in/out around the cursor.
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

    // Vector2 cache.
    private _cacheVector2: Gfx.Vector2 = new Gfx.Vector2();

    private _chartPickObjects: Gfx.Object3D[] = [];

    private _selectedTarget: ChartHit | null = null;

    /** Raycaster used to find the world-space X of the cursor when no bar is picked directly. */
    private _hoverRaycaster: Gfx.Raycaster = new Gfx.Raycaster();

    /** The chart plane the cursor ray is intersected with, rebuilt from the chart's world matrix. */
    private _hoverPlane: Gfx.Plane = new Gfx.Plane(new Gfx.Vector3(0, 0, 1), 0);

    /** Scratch normal used when rebuilding `_hoverPlane`. */
    private _hoverPlaneNormal: Gfx.Vector3 = new Gfx.Vector3();

    /** Scratch point used when rebuilding `_hoverPlane`. */
    private _hoverPlanePoint: Gfx.Vector3 = new Gfx.Vector3();

    /** Scratch vector reused for the ray/plane intersection. */
    private _hoverIntersection: Gfx.Vector3 = new Gfx.Vector3();

    /** Scratch vector reused for the chart-local cursor position. */
    private _hoverLocal: Gfx.Vector3 = new Gfx.Vector3();

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
    }

    public setCurrentChart(chart: Chart): void {
        // The previous chart must not keep reporting a hovered bar once it is no longer current.
        this.options.chart?.setHoveredBarIndex(-1);

        this.options.chart = chart;

        if (this.options.chart) {
            this.options.chart.onDataSet = () => {
                // The zoom setter keeps `numBarsVisible` in sync with the zoom level, so new data
                // only needs the camera re-centred.
                this.centerCameraOnChart();
            }
        }
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
        canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
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
        canvas.removeEventListener('mouseleave', this.handleMouseLeave);
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
    public centerCameraOnChart(): void {
        if (!this.camera || !this.options.chart) {
            console.warn("Cannot center camera on chart: camera or chart is not available.");
            return;
        }

        const bbox = this.options.chart.getBBox();
        this.camera.position.set((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, 0.8);
        this.camera.lookAt((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, 2);

        console.log("Centered camera on chart:", this.options.chart, bbox);
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

    /**
     * Clears the hovered column of every series of the current chart.
     *
     * Hover is chart-wide (see `Chart.setHoveredBarIndex`), so every series has to be reset rather
     * than only the one that was picked last.
     */
    private resetHoverStates(): void {
        const chart = this.options.chart;

        if (!chart)
            return;

        for (const series of chart.series)
            series.setHoveredValue(-1, -1);
    }

    /**
     * Intersects the cursor ray with the chart's plane and returns the resulting X position in
     * chart-local space.
     *
     * The chart is flat, so the cursor ray is intersected with the chart's own plane. Deriving
     * the plane from the chart's world matrix keeps this correct if the chart is ever moved or
     * rotated in the scene. The matrix is refreshed by the render loop every frame.
     *
     * @returns The chart-local X of the cursor, or `null` when the ray misses the chart plane.
     */
    private getChartLocalX(viewportPosition: Gfx.Vector2): number | null {
        const chart = this.options?.chart;
        const camera = this.camera;

        if (!chart || !camera)
            return null;

        this._hoverPlaneNormal.set(0, 0, 1).transformDirection(chart.matrixWorld);
        this._hoverPlanePoint.set(0, 0, 0).applyMatrix4(chart.matrixWorld);
        this._hoverPlane.setFromNormalAndCoplanarPoint(this._hoverPlaneNormal, this._hoverPlanePoint);

        this._hoverRaycaster.setFromCamera(viewportPosition, camera.native);

        if (!this._hoverRaycaster.ray.intersectPlane(this._hoverPlane, this._hoverIntersection))
            return null;

        // The chart may be transformed, so the intersection is converted into chart-local space.
        this._hoverLocal.copy(this._hoverIntersection);
        chart.worldToLocal(this._hoverLocal);

        return this._hoverLocal.x;
    }

    /**
     * Finds the bar column under the cursor, regardless of whether the cursor is exactly on a
     * drawn bar or value point.
     *
     * The cursor ray is intersected with the chart's plane and the resulting X position is mapped
     * back onto the bar layout, so hovering anywhere over the chart resolves to the nearest bar.
     * This is what lets a single hover report the values of every indicator at that bar.
     *
     * @returns The bar index within the visible window, or -1 when the cursor is outside the chart.
     */
    private findNearestBarIndex(viewportPosition: Gfx.Vector2): number {
        const chart = this.options?.chart;

        if (!chart || !this.camera || chart.series.length === 0)
            return -1;

        const localX = this.getChartLocalX(viewportPosition);

        if (localX === null)
            return -1;

        const bbox = chart.getBBox();

        if (localX < bbox.min.x || localX > bbox.max.x ||
            this._hoverLocal.y < bbox.min.y || this._hoverLocal.y > bbox.max.y)
            return -1;

        const step = chart.worldPerBar;

        if (!Number.isFinite(step) || step <= 0)
            return -1;

        // Bars are laid out at (index + 1) * step in series-local space (see Series.layoutBars()).
        const index = Math.round((localX - chart.series[0].position.x) / step) - 1;

        return index >= 0 && index < chart.numBarsVisible ? index : -1;
    }

    /**
     * World units covered by one screen pixel, per axis.
     *
     * Dragging the chart has to move it by the same distance the pointer travelled on screen, so
     * the pixel delta of a drag is converted into world units with this. The values are derived
     * from the chart's projected size, so they stay correct if the camera or the viewport changes.
     */
    private getWorldPerPixel(): { x: number; y: number } {
        const chart = this.options.chart;
        const camera = this.camera;
        const fallback = { x: 0.002, y: 0.002 };

        if (!chart || !camera)
            return fallback;

        const canvas = this.renderer.native.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        if (width <= 0 || height <= 0)
            return fallback;

        const bbox = chart.getBBox();
        const project = (x: number, y: number): Gfx.Vector3 =>
            new Gfx.Vector3(x, y, 0).applyMatrix4(chart.matrixWorld).project(camera.native);

        const left = project(bbox.min.x, bbox.min.y);
        const right = project(bbox.max.x, bbox.min.y);
        const top = project(bbox.min.x, bbox.max.y);

        // NDC spans -1..1, i.e. two units across the whole viewport.
        const pixelWidth = Math.abs(right.x - left.x) / 2 * width;
        const pixelHeight = Math.abs(top.y - left.y) / 2 * height;

        return {
            x: pixelWidth > 0 ? chart.chartWidth / pixelWidth : fallback.x,
            y: pixelHeight > 0 ? chart.chartHeight / pixelHeight : fallback.y,
        };
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
        if (!this.scene || !this.camera || !this.options.chart)
            return null;

        const pickObjects = this._chartPickObjects;
        pickObjects.length = 0;
        for (const series of this.options.chart.series)
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
        if (isUiBlockingInput())
            return;

        this.keysPressed[e.key.toLowerCase()] = true;

        if (!this.options.chart)
            return;

        if (e.shiftKey)
            this.isShiftPressed = true;

        if (e.altKey)
            this.isAltPressed = true;

        // Chart zoom and re-centering are canvas operations, so they only apply while the pointer
        // is over the canvas — the same rule the mouse-driven operations follow.
        if (!this.renderer.isPointerOver)
            return;

        if (e.key === '-' || e.key === '+' || e.key === '=') {
            // Changing chart zoom.
            const zoomFactor = e.key === '+' || e.key === '=' ? 2 : 0.5;

            this.options.chart.zoom = Chart.clampZoom(this.options.chart.zoom * zoomFactor);
        }
        else if (e.key === '0') {
            this.options.chart.zoom = 1;
        }
        else if (e.key === 'Home') {
            // Resetting camera position and rotation to default.
            this.centerCameraOnChart();
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

        // The window lost focus, so no bar is hovered any more.
        this.resetHoverStates();
        this.options.chart?.setHoveredBarIndex(-1);
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

        if (!this.options.chart)
            return;

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
                        this._selectedGlobalBarIndex = this.options.chart.scrollX + hit.target.barIndex;
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

        // Mouse movement is tracked on the window so a drag keeps working when the cursor briefly
        // leaves the canvas, but the chart must only react while the pointer is over the canvas.
        // Otherwise hovering the side panel would highlight bars and scroll the chart.
        if (!this.renderer.isPointerOver) {
            this.isScrolling = false;
            this.resetHoverStates();
            this.options?.chart?.setHoveredBarIndex(-1);
            return;
        }

        this.lastMouseX = e.offsetX;
        this.lastMouseY = e.offsetY;

        const objectPicker = this.rendererPass.getPlugin(ObjectPicker);

        this._cacheVector2.set(e.clientX, e.clientY);
        const viewportPosition = this.renderer.clientToViewport(this._cacheVector2);

        if (this.isScrolling) {
            // Dragging scrolls the chart the same way the pointer moves: dragging left reveals the
            // bars to the right, dragging up reveals the prices above. The pixel delta is
            // converted into world units so the chart follows the cursor exactly, and the scroll
            // is applied without interpolation so the chart does not lag behind the pointer.
            const worldPerPixel = this.getWorldPerPixel();
            const chart = this.options.chart;

            if (chart) {
                chart.scrollTo(
                    chart.targetScrollX - e.movementX * worldPerPixel.x,
                    chart.targetScrollY - e.movementY * worldPerPixel.y,
                    true
                );
            }

            this._restoreSelection();
        }
        else if (objectPicker) {
            const chart = this.options.chart;

            if (!chart)
                return;

            const hit = this.findChartHit(objectPicker, viewportPosition);

            // The hovered bar is resolved from the cursor's position over the chart rather than
            // from the picked geometry, so hovering anywhere in a bar column reports every
            // indicator's value at that bar — not just the series under the cursor. The picked
            // bar is only a fallback for cursors just outside the chart's bounds.
            const nearestBarIndex = this.findNearestBarIndex(viewportPosition);
            const hoveredBarIndex = nearestBarIndex >= 0 ? nearestBarIndex : (hit?.target.barIndex ?? -1);

            chart.setHoveredBarIndex(hoveredBarIndex);

            // Every visible series marks the hovered column, so all indicators are highlighted
            // from top to bottom instead of only the line nearest the cursor. Passing -1 as the
            // value channel marks the whole column. Hidden series are cleared so they do not
            // reappear with a stale marker once they are shown again.
            for (const series of chart.series)
                series.setHoveredValue(series.visible ? hoveredBarIndex : -1, -1);
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
     * Clears the hover state when the cursor leaves the canvas, so the tooltip and the bar
     * highlight do not linger over a chart the mouse is no longer over.
     */
    private handleMouseLeave(): void {
        this.resetHoverStates();
        this.options.chart?.setHoveredBarIndex(-1);
    }

    /**
     * Handles the mouse wheel event to zoom the chart in or out around the cursor.
     *
     * Scrolling the wheel up zooms in and scrolling it down zooms out. The bar under the cursor
     * stays under the cursor, so the chart grows towards the pointer instead of its centre.
     *
     * @param e The wheel event.
     */
    private handleWheel(e: WheelEvent): void {
        e.preventDefault();

        const chart = this.options.chart;

        if (!chart || e.deltaY === 0)
            return;

        // Fractional notches (trackpads) are handled by scaling the factor exponentially, so a
        // small delta produces a proportionally small zoom change.
        const notches = -e.deltaY / 100;
        const factor = Math.pow(Chart.ZOOM_WHEEL_FACTOR, notches);

        // The anchor is the cursor's horizontal position inside the chart, so the bar under the
        // pointer stays put while zooming.
        this._cacheVector2.set(e.clientX, e.clientY);
        const viewportPosition = this.renderer.clientToViewport(this._cacheVector2);
        const localX = this.getChartLocalX(viewportPosition);
        const bbox = chart.getBBox();
        const anchor = localX === null || bbox.max.x <= bbox.min.x
            ? 0.5
            : (localX - bbox.min.x) / (bbox.max.x - bbox.min.x);

        chart.zoomBy(factor, anchor);
    }
}
