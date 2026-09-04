import * as Gfx from 'three';
import { type Chart } from './Chart';
import { RendererRenderPass } from './../../rendering/RendererRenderPass';
import { Renderer } from './../Renderer';

/**
 * Last-applied visual state of a label, used to avoid redundant style/text writes.
 */
interface LabelState {
    x: number;
    y: number;
    opacity: number;
    visible: boolean;
    text: string;
}

export class ChartGrid extends Gfx.Object3D
{
    /**
     * Unique identifier for the chart. It's not the id of the Object3D as we need the id to be persistent across sessions.
     */
    public uuid: string = crypto.randomUUID();

    /**
     * The chart that this grid belongs to.
     */
    public chart: Chart;

    /**
     * Tracks the number of grid lines to avoid unnecessary buffer reallocations.
     */
    private numAllocatedGridLines: number = -1;

    /**
     * Cached position buffer attribute to avoid reallocation when positions don't increase.
     */
    private gfxPositionBuffer: Gfx.Float32BufferAttribute | null = null;

    /**
     * Cached per-vertex color buffer (RGBA) for edge-proximity fading.
     */
    private gfxColorBuffer: Gfx.Float32BufferAttribute | null = null;

    
    /**
     * Temporary vector used for calculations to avoid creating new instances repeatedly.
     */
    private _tempVector: Gfx.Vector3 = new Gfx.Vector3();

    /**
     * Cached last-applied visual state per label, used to skip redundant DOM writes
     * (style/text mutations are expensive and were causing layout thrashing every frame).
     */
    private labelStateCache: WeakMap<HTMLDivElement, LabelState> = new WeakMap();

    /**
     * Frame id (see Renderer.frameId) at which layout/colors/labels were last recomputed, used to
     * avoid redoing that work when updateMatrixWorld() is invoked multiple times within the same
     * real frame (e.g. by SSAA's multiple internal render() calls) — this was the main source of
     * the label DOM updates running far more often than once per displayed frame.
     */
    private lastUpdatedFrameId: number = -1;

    /**
     * Returns the horizontal shift of the grid lines based on the chart's scroll position and zoom level.
     */
    public get shiftModuloX(): number {
        let shiftX = this.chart.scrollX % this.chart.verticalLineDistance / this.chart.zoom;

        if (shiftX < 0) {
            shiftX += this.chart.verticalLineDistance / this.chart.zoom;
        }

        return shiftX;
    }

    /**
     * Returns the vertical shift of the grid lines based on the chart's scroll position and zoom level.
     */
    public get shiftModuloY(): number {
        let shiftY = this.chart.scrollY % this.chart.horizontalLineDistance / this.chart.zoom;

        if (shiftY < 0) {
            shiftY += this.chart.horizontalLineDistance / this.chart.zoom;
        }

        return shiftY;
    }

    /**
     * The grid lines of the chart.
     */
    public gfxGridLines: Gfx.LineSegments = new Gfx.LineSegments(
        new Gfx.BufferGeometry(),
        new Gfx.ShaderMaterial({
            vertexShader: `
                attribute vec4 lineColor;
                varying vec4 vLineColor;
                void main() {
                    vLineColor = lineColor;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision mediump float;
                varying vec4 vLineColor;
                void main() {
                    if (vLineColor.a < 0.01) discard;
                    gl_FragColor = vLineColor;
                }
            `,
            transparent: true,
        })
    );

    /**
     * Cube that represents the bounding box of the chart.
     */
    public gfxGridCube: Gfx.Mesh = new Gfx.Mesh(new Gfx.BoxGeometry(1, 1, 1), new Gfx.MeshBasicMaterial({ color: 0x000000, side: Gfx.BackSide }));

    /**
     * Container for all the labels of the chart grid.
     */
    private labelsDOM: HTMLDivElement = document.createElement('div');

    /**
     * Labels for the horizontal and vertical grid lines of the chart.
     */
    private labelsHorizontalLinesLeftDOM: HTMLDivElement = document.createElement('div');

    /**
     * Labels for the horizontal grid lines on the right side of the chart.
     */
    private labelsHorizontalLinesRightDOM: HTMLDivElement = document.createElement('div');

    /**
     * Labels for the vertical grid lines at the bottom of the chart.
     */
    private labelsVerticalLinesBottomDOM: HTMLDivElement = document.createElement('div');

    /**
     * Construtor.
     */
    public constructor(chart: Chart) {
        super();

        this.chart = chart;

        this.gfxGridLines.frustumCulled = false;

        this.add(this.gfxGridCube);
        this.add(this.gfxGridLines);
    }

    /**
     * Layouts the grid lines of the chart. This will be called whenever the chart is updated.
     * 
     * Lines will be laid out based on the chart's bounding box. The grid lines will be laid out in
     * the x-axis and y-axis, scrolled by gridLinesShiftX and gridLinesShiftY respectively.
     */
    public layoutGridLines(): void {
        if (!this.chart) {
            console.warn('No chart set for the grid.');
            return;
        }

        const chart = this.chart;
        const bbox = chart.getBBox();
        const chartWidth  = this.chart.chartWidth;
        const chartHeight = this.chart.chartHeight;

        const numLinesHorizontal   = this.chart.numHorizontalLines;
        const numLinesVertical = this.chart.numInitialBars;
        const numLines = numLinesVertical + numLinesHorizontal;

        const lineDistanceVertical = chartWidth / (numLinesVertical);
        const lineDistanceHorizontal = chartHeight / (numLinesHorizontal);

        // Reallocate the GPU buffer only when line counts change.
        if (numLines !== this.numAllocatedGridLines) {
            const numLinePairsV  = numLinesVertical + 2;
            const numLinePairsH  = numLinesHorizontal + 2;
            const totalLinePairs = 3 * numLinePairsV + 2 * numLinePairsH + 5;
            const requiredBufferLength    = totalLinePairs * 6;

            if (!this.gfxPositionBuffer || requiredBufferLength > this.gfxPositionBuffer.array.length) {
                this.gfxPositionBuffer = new Gfx.Float32BufferAttribute(new Float32Array(requiredBufferLength), 3);
                this.gfxGridLines.geometry.setAttribute('position', this.gfxPositionBuffer);
            }

            const requiredColorBufferLength = (requiredBufferLength / 3) * 4;
            if (!this.gfxColorBuffer || requiredColorBufferLength > this.gfxColorBuffer.array.length) {
                this.gfxColorBuffer = new Gfx.Float32BufferAttribute(new Float32Array(requiredColorBufferLength), 4);
                this.gfxGridLines.geometry.setAttribute('lineColor', this.gfxColorBuffer);
            }

            this.numAllocatedGridLines = numLines;
        }

        if (!this.gfxPositionBuffer)
            return;

        const chartVisibleWidth = chartWidth - 1.5 * lineDistanceHorizontal;

        let shiftX = this.chart.scrollX % lineDistanceVertical;
        let shiftY = this.chart.scrollY % lineDistanceHorizontal;

        if (shiftX < 0)
            shiftX += lineDistanceVertical;

        if (shiftY < 0)
            shiftY += lineDistanceHorizontal;

        // Always rewrite positions so scroll shifts are applied every frame.
        const arr = this.gfxPositionBuffer.array as Float32Array;
        let idx = 0;

        // Left and right side — horizontal lines scrolled vertically.
        for (let i = 0; i < numLinesHorizontal; i++) {
            const y = bbox.min.y + ((chartHeight * (i / (numLinesHorizontal)) + shiftY) % chartHeight);
            arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
            arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.max.z;
            arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
            arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.max.z;
        }

        // Back face — horizontal lines scrolled vertically.
        for (let i = 0; i < numLinesHorizontal; i++) {
            const y = bbox.min.y + ((chartHeight * (i / (numLinesHorizontal)) + shiftY)) % chartHeight;
            arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
            arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = bbox.min.z;
        }

        // Back face — vertical lines scrolled horizontally.
        for (let i = 0; i < numLinesVertical; i++) {
            const x = bbox.min.x + lineDistanceVertical + ((chartWidth * (i / (numLinesVertical)) - shiftX) % chartWidth);
            arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
            arr[idx++] = x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        }

        // Floor — depth lines using the same x positions as the front vertical lines,
        // scrolled identically. Lines that land on the left or right wall are suppressed.
        for (let i = 0; i < numLinesVertical; i++) {
            const x = bbox.min.x + lineDistanceVertical + ((chartWidth * (i / (numLinesVertical)) - shiftX) % chartWidth);
            arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
            arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;
        }

        // Additional horizontal line at the very top edge of the chart.
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;

        // Additional horizontal line at the very top, back edge of the chart.
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;

        // Additional horizontal line at the very bottom edge of the chart.
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

        // Right side — additional horizontal line at the very top edge of the chart.
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;

        // Right side — additional horizontal line at the very bottom edge of the chart.
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

        // Left side — additional vertical line at the left.
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;

        // Right side — additional vertical line at the right.
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.min.z;
        
        // Bottom back — additional horizontal line at the very bottom edge of the chart.
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.min.z;

        // Back/top corner edges (static structural bounds, not grid lines).
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = bbox.max.z;

        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = bbox.max.z;


        this.gfxPositionBuffer.needsUpdate = true;
        this.gfxGridLines.geometry.setDrawRange(0, idx / 3);

        // Positioning the grid cube to match the chart's bounding box.
        const padding = 0.0001;

        this.gfxGridCube.position.set(
            (bbox.min.x + bbox.max.x) / 2,
            (bbox.min.y + bbox.max.y) / 2,
            (bbox.min.z + bbox.max.z) / 2
        );

        this.gfxGridCube.scale.set(
            chartWidth  + padding,
            chartHeight + padding,
            bbox.max.z - bbox.min.z + padding
        );
    }

    /**
     * Updates the chart grid, including labels and colors.
     */
    public update(): void {
        this.updateLabels();
        this.updateColors();
    }

    /**
     * Sets the style for a label element.
     */
    public setLabelStyle(label: HTMLDivElement, labelType: 'horizontal-left' | 'horizontal-right' | 'vertical'): void {
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.justifyContent = 'center';
        label.style.position = 'absolute';
        label.style.top = '0';
        label.style.left = '0';
        // Labels are moved via `transform` (compositor-only) instead of `top`/`left`
        // (layout-triggering) to avoid reflow every frame.
        label.style.willChange = 'transform';
        label.style.pointerEvents = 'none';
        label.style.whiteSpace = 'nowrap';
        label.style.height = '16px';
        label.style.width = '60px';
        label.style.verticalAlign = 'middle';
        label.style.fontSize = '12px';
        label.style.color = '#777';
        label.textContent = '12.34';

        // Positioning label based on its type.
        if (labelType === 'horizontal-left') {
            label.style.marginTop = '-8px';
            label.style.justifyContent = 'flex-end';
            label.style.marginLeft = '-10px';
        } else if (labelType === 'horizontal-right') {
            label.style.marginTop = '-8px';
            label.style.justifyContent = 'flex-start';
            label.style.marginLeft = '10px';
        } else if (labelType === 'vertical') {
            label.style.justifyContent = 'center';
            label.style.marginTop = '14px';
            label.style.textAlign = 'center';
        }
    }

    /**
     * Sets the text for a horizontal line label at the specified index.
     * @param index - The index of the horizontal line label.
     * @param text - The text to set for the label.
     */
    public setHorizontalLineLabel(index: number, text: string): void {
        if (index < 0 || index >= this.labelsHorizontalLinesLeftDOM.childElementCount)
            return;

        const labelLeft = this.labelsHorizontalLinesLeftDOM.children[index] as HTMLDivElement;
        const labelRight = this.labelsHorizontalLinesRightDOM.children[index] as HTMLDivElement;

        labelLeft.textContent = text;
        labelRight.textContent = text;
    }

    /**
     * Sets the text for a vertical line label at the specified index.
     * @param index - The index of the vertical line label.
     * @param text - The text to set for the label.
     */
    public setVerticalLineLabel(index: number, text: string): void {
        if (index < 0 || index >= this.labelsVerticalLinesBottomDOM.childElementCount)
            return;

        const label = this.labelsVerticalLinesBottomDOM.children[index] as HTMLDivElement;

        label.textContent = text;
    }

    /**
     * Applies position, visibility, opacity and text to a label, skipping any DOM write
     * whose value hasn't changed since the last call. This is the main defense against
     * layout thrashing when many labels are refreshed every frame.
     */
    private applyLabelState(label: HTMLDivElement, x: number, y: number, opacity: number, visible: boolean, text?: string): void {
        let state = this.labelStateCache.get(label);

        if (!state) {
            state = { x: NaN, y: NaN, opacity: NaN, visible: !visible, text: '' };
            this.labelStateCache.set(label, state);
        }

        if (visible) {
            if (!state.visible) {
                label.style.display = 'flex';
                state.visible = true;
            }

            if (state.x !== x || state.y !== y) {
                label.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                state.x = x;
                state.y = y;
            }
        } else if (state.visible) {
            label.style.display = 'none';
            state.visible = false;
        }

        if (state.opacity !== opacity) {
            label.style.opacity = `${opacity}`;
            state.opacity = opacity;
        }

        if (text !== undefined && state.text !== text) {
            label.innerHTML = text;
            state.text = text;
        }
    }

    /**
     * Finds the bar in the first series closest to the given world-space X position and
     * returns its date formatted as "D Mon YYYY", or an empty string if there's no data.
     */
    private getNearestBarDateLabel(worldX: number): string {
        const series = this.chart.series[0];

        if (!series || series.bars.length === 0)
            return '';

        const barSpacingWorld = (this.chart.barWidth + this.chart.barSpacing) * this.chart.zoom;
        let barIndex = Math.round((worldX - series.position.x) / barSpacingWorld) - 1;
        barIndex = Math.max(0, Math.min(series.bars.length - 1, barIndex));

        const bar = series.bars[barIndex];

        if (!bar || bar.time_ms === 0)
            return '';

        return ChartGrid.formatDate(bar.time_ms);
    }

    /**
     * Formats a timestamp (in milliseconds) as "D Mon YYYY", e.g. "2 May 2024".
     */
    private static formatDate(timeMs: number): string {
        const date = new Date(timeMs);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Returning date and time.
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}<br />${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    /**
     * Computes the fade alpha for a grid line at the given distance from the nearest chart edge.
     */
    private computeEdgeFadeAlphaLines(distToEdge: number, fadeDistance: number): number {
        if (distToEdge <= 0.0001)
            return 1.0;

        return Math.max(0, Math.min(1.0, Math.pow(distToEdge / fadeDistance, 2)));
    }

    /**
     * Computes the fade alpha for a label at the given distance from the nearest chart edge.
     */
    private computeEdgeFadeAlphaLabels(distToEdge: number, fadeDistance: number): number {
        if (distToEdge <= 0.0001)
            return 0.0;

        return Math.max(0, Math.min(1.0, Math.pow(distToEdge / fadeDistance, 2)));
    } 

    /**
     * Updates the labels of the chart grid.
     */
    public updateLabels(): void {
        // Ensuring capacity for the horizontal line labels on the left and right side of the chart.
        for (let i = this.labelsHorizontalLinesLeftDOM.childElementCount; i <= this.chart.numHorizontalLines; i++) {
            let labelLeft = document.createElement('div');
            let labelRight = document.createElement('div');
            this.setLabelStyle(labelLeft, 'horizontal-left');
            this.setLabelStyle(labelRight, 'horizontal-right');
            this.setHorizontalLineLabel(i, '10');
            this.labelsHorizontalLinesLeftDOM.appendChild(labelLeft);
            this.labelsHorizontalLinesRightDOM.appendChild(labelRight);            
        }

        // Removing excessive horizontal line labels on the left and right side of the chart.
        while (this.labelsHorizontalLinesLeftDOM.childElementCount > this.chart.numHorizontalLines) {
            let label = this.labelsHorizontalLinesLeftDOM.lastChild;
            if (label && label.parentElement) {
                label.parentElement.removeChild(label);
            }

            label = this.labelsHorizontalLinesRightDOM.lastChild;
            if (label && label.parentElement) {
                label.parentElement.removeChild(label);
            }
        }

        // Ensuring capacity for the vertical line labels at the bottom of the chart.
        for (let i = this.labelsVerticalLinesBottomDOM.childElementCount; i <= this.chart.numInitialBars; i++) {
            const label = document.createElement('div');
            this.setLabelStyle(label, 'vertical');
            this.setVerticalLineLabel(i, '2 may 2027');
            this.labelsVerticalLinesBottomDOM.appendChild(label);
        }
        
        // Removing excessive vertical line labels at the bottom of the chart.
        while (this.labelsVerticalLinesBottomDOM.childElementCount > this.chart.numInitialBars + 1) {
            let label = this.labelsVerticalLinesBottomDOM.lastChild;
            if (label && label.parentElement) {
                label.parentElement.removeChild(label);
            }
        }

        // Adding labels' divs to the container.

        if (this.labelsHorizontalLinesLeftDOM.parentElement === null) {
            this.labelsDOM.appendChild(this.labelsHorizontalLinesLeftDOM);
        }

        if (this.labelsHorizontalLinesRightDOM.parentElement === null) {
            this.labelsDOM.appendChild(this.labelsHorizontalLinesRightDOM);
        }

        if (this.labelsVerticalLinesBottomDOM.parentElement === null) {
            this.labelsDOM.appendChild(this.labelsVerticalLinesBottomDOM);
        }

        // Adding labels container to the document if it hasn't been added already.
        if (this.labelsDOM.parentElement === null) {
            this.labelsDOM.style.position = 'absolute';
            this.labelsDOM.style.top = '0';
            this.labelsDOM.style.left = '0';
            this.labelsDOM.style.width = '100%';
            this.labelsDOM.style.height = '100%';
            this.labelsDOM.style.pointerEvents = 'none';
            RendererRenderPass.Current!.renderer.container!.appendChild(this.labelsDOM);
        }

        const bbox = this.chart.getBBox();

        const clientWidth = this.labelsDOM.clientWidth;
        const clientHeight = this.labelsDOM.clientHeight;

        // Using the same (unzoomed) line spacing and scroll remainder as layoutGridLines() so the
        // labels line up exactly with the rendered grid lines.
        const chartHeight = this.chart.chartHeight;
        const numLinesHorizontal = this.chart.numHorizontalLines;
        const lineDistanceHorizontal = chartHeight / numLinesHorizontal;

        let shiftY = this.chart.scrollY % lineDistanceHorizontal;
        if (shiftY < 0)
            shiftY += lineDistanceHorizontal;

        // Bars are rendered offset by scrollY (see Chart.updateScroll()), so a line drawn at a given
        // world-space level currently shows whatever bar price is `scrollY` below its own price.
        // Reversing that offset (rather than deriving it from the on-screen, sliding `y`) is what
        // keeps a label's value fixed while it slides, only stepping once scrollY has advanced a
        // full line distance — i.e. exactly when a new line takes its place.
        const scrolledLevels = Math.floor(this.chart.scrollY / lineDistanceHorizontal + 1e-9);

        // Position horizontal labels on the left and right sides of the chart.
        for (let i = 0; i < numLinesHorizontal; i++) {
            const labelLeft = this.labelsHorizontalLinesLeftDOM.children[i] as HTMLDivElement;
            const labelRight = this.labelsHorizontalLinesRightDOM.children[i] as HTMLDivElement;

            const y = bbox.min.y + ((i * lineDistanceHorizontal + shiftY) % chartHeight);

            // Fade out the label as it approaches the top or bottom edge of the chart, same as the grid lines.
            const distToEdgeY = Math.min(y - bbox.min.y, bbox.max.y - y);

            const labelAlpha = this.computeEdgeFadeAlphaLabels(distToEdgeY, this.chart.initialHorizontalLineDistance);

            // The real price at this line's absolute level, fixed until scrolling overflows a full line distance.
            const price = (bbox.min.y + (i - scrolledLevels) * lineDistanceHorizontal).toFixed(5);

            this._tempVector.set(bbox.min.x, y, bbox.max.z);
            this._tempVector.applyMatrix4(this.chart.matrixWorld);
            this._tempVector.project(RendererRenderPass.Current!.camera!.native);

            if (this._tempVector.z <= 1)
            {
                const screenX = (this._tempVector.x + 1) * 0.5 * clientWidth - 60;
                const screenY = (1 - this._tempVector.y) * 0.5 * clientHeight;

                this.applyLabelState(labelLeft, screenX, screenY, labelAlpha, true, price);
            }
            else {
                this.applyLabelState(labelLeft, 0, 0, labelAlpha, false, price);
            }

            this._tempVector.set(bbox.max.x, y, bbox.max.z);
            this._tempVector.applyMatrix4(this.chart.matrixWorld);
            this._tempVector.project(RendererRenderPass.Current!.camera!.native);

            if (this._tempVector.z <= 1)
            {
                const screenX = (this._tempVector.x + 1) * 0.5 * clientWidth;
                const screenY = (1 - this._tempVector.y) * 0.5 * clientHeight;

                this.applyLabelState(labelRight, screenX, screenY, labelAlpha, true, price);
            }
            else {
                this.applyLabelState(labelRight, 0, 0, labelAlpha, false, price);
            }
        }

        // Position vertical labels on the top and bottom sides of the chart.
        for (let i = 1; i <= this.chart.numInitialBars; i++) {
            const label = this.labelsVerticalLinesBottomDOM.children[i] as HTMLDivElement;
            
            const x = bbox.min.x + i * (bbox.max.x - bbox.min.x) / this.chart.numInitialBars;
            const effectiveX = x - (this.shiftModuloX * this.chart.zoom);

            // Fade out the label as it approaches the left or right edge of the chart, same as the grid lines.
            const distToEdgeX = Math.min(effectiveX - bbox.min.x, bbox.max.x - effectiveX);
            const labelAlpha = this.computeEdgeFadeAlphaLabels(distToEdgeX, this.chart.initialVerticalLineDistance);

            const dateText = this.getNearestBarDateLabel(effectiveX);

            this._tempVector.set(effectiveX, bbox.min.y, bbox.max.z);
            this._tempVector.applyMatrix4(this.chart.matrixWorld);
            this._tempVector.project(RendererRenderPass.Current!.camera!.native);

            if (this._tempVector.z <= 1)
            {
                const screenX = (this._tempVector.x + 1) * 0.5 * clientWidth - 30;
                const screenY = (1 - this._tempVector.y) * 0.5 * clientHeight;

                this.applyLabelState(label, screenX, screenY, labelAlpha, true, dateText);
            }
            else {
                this.applyLabelState(label, 0, 0, labelAlpha, false, dateText);
            }
        }
    }

    /**
     * Updates the colors of the chart grid lines.
     */
    public updateColors(): void {
        if (!this.gfxPositionBuffer || !this.gfxColorBuffer)
            return;

        const bbox          = this.chart.getBBox();
        const fadeDistanceV = this.chart.initialVerticalLineDistance;
        const fadeDistanceH = this.chart.initialHorizontalLineDistance;
        const drawCount     = this.gfxGridLines.geometry.drawRange.count;
        const vertexCount   = this.gfxGridLines.geometry.drawRange.start + drawCount;

        const pos = this.gfxPositionBuffer.array as Float32Array;
        const col = this.gfxColorBuffer.array as Float32Array;

        // Base line color: 0x202020.
        const r = 0x20 / 0xff;
        const g = 0x20 / 0xff;
        const b = 0x20 / 0xff;

        for (let vi = 0; vi < vertexCount - 1; vi += 2) {
            const x0 = pos[vi * 3];
            const y0 = pos[vi * 3 + 1];
            const x1 = pos[(vi + 1) * 3];
            const y1 = pos[(vi + 1) * 3 + 1];

            let alpha = 1.0;

            // Both axes are evaluated independently so lines that share both x and y
            // (side horizontal lines running in z) get y-fading even when on the x boundary.
            if (Math.abs(x0 - x1) < 0.0001) {
                const distToEdge = Math.min(x0 - bbox.min.x, bbox.max.x - x0);
                alpha = Math.min(alpha, this.computeEdgeFadeAlphaLines(distToEdge, fadeDistanceV));
            }

            if (Math.abs(y0 - y1) < 0.0001) {
                const distToEdge = Math.min(y0 - bbox.min.y, bbox.max.y - y0);
                alpha = Math.min(alpha, this.computeEdgeFadeAlphaLines(distToEdge, fadeDistanceH));
            }

            col[vi * 4]     = r; col[vi * 4 + 1]     = g; col[vi * 4 + 2]     = b; col[vi * 4 + 3]     = alpha;
            col[(vi+1) * 4] = r; col[(vi+1) * 4 + 1] = g; col[(vi+1) * 4 + 2] = b; col[(vi+1) * 4 + 3] = alpha;
        }

        this.gfxColorBuffer.needsUpdate = true;
    }

    /**
     * @inheritDoc
     */
    public override updateMatrixWorld(force?: boolean): void {
        super.updateMatrixWorld(force);

        if (Renderer.frameId === this.lastUpdatedFrameId)
            return;

        this.lastUpdatedFrameId = Renderer.frameId;

        this.layoutGridLines();
        this.updateColors();
        this.updateLabels();
    }
}