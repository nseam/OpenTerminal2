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
     * Returns the world-space X positions of the vertical grid lines.
     *
     * Lines are spaced `verticalGridLineDistance` apart and scroll with `scrollX`. The first line
     * is always within one spacing of the left edge (so it is never missing), and no line is ever
     * placed outside the chart.
     *
     * Both the rendered lines and their labels use this, so they cannot drift apart.
     */
    public getVerticalLinePositions(): number[] {
        const bbox = this.chart.getBBox();
        const spacing = this.chart.verticalGridLineDistance;

        if (!Number.isFinite(spacing) || spacing <= 0)
            return [];

        // Offset of the first line from the left edge, in [0, spacing).
        const shift = ((this.chart.scrollX % spacing) + spacing) % spacing;
        const firstX = bbox.min.x + (spacing - shift) % spacing;

        // One extra slot covers the case where a line lands exactly on the right edge.
        const maxLines = this.chart.numVerticalLines + 1;
        const positions: number[] = [];

        for (let x = firstX; x <= bbox.max.x + 1e-9 && positions.length < maxLines; x += spacing)
            positions.push(x);

        return positions;
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
     * Labels for the last-price lines of each price indicator.
     */
    private labelsLastPriceDOM: HTMLDivElement = document.createElement('div');

    /**
     * Tooltip shown when hovering over a last-price label.
     */
    private domLastPriceHover: HTMLDivElement = document.createElement('div');

    /**
     * Whether the last-price tooltip has been attached to the document.
     */
    private lastPriceHoverAttached: boolean = false;

    /**
     * Moves the last-price tooltip next to the mouse cursor.
     */
    private positionLastPriceHover = (event: MouseEvent): void => {
        this.domLastPriceHover.style.left = `${event.pageX + 10}px`;
        this.domLastPriceHover.style.top = `${event.pageY + 10}px`;
    };

    /**
     * Construtor.
     */
    public constructor(chart: Chart) {
        super();

        this.chart = chart;

        this.gfxGridLines.frustumCulled = false;

        this.add(this.gfxGridLines);
    }

    /**
     * Layouts the grid lines of the chart. This will be called whenever the chart is updated.
     *
     * The chart is flat (2D), so the grid consists of horizontal and vertical lines only, all
     * lying in the z = 0 plane. Horizontal lines scroll vertically, vertical lines horizontally.
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

        if (!Number.isFinite(chartWidth) || !Number.isFinite(chartHeight) || chartWidth <= 0 || chartHeight <= 0)
            return;

        const numLinesHorizontal = this.chart.maxHorizontalLines;
        const verticalLinePositions = this.getVerticalLinePositions();
        const numLinesVertical   = verticalLinePositions.length;
        const lastPriceLines     = this.chart.lastPriceLines;
        const numLines           = numLinesVertical + numLinesHorizontal + lastPriceLines.length;

        const lineDistanceHorizontal = chartHeight / numLinesHorizontal;

        // Reallocate the GPU buffer only when line counts change.
        if (numLines !== this.numAllocatedGridLines) {
            // One line pair per grid line, plus the four border edges.
            const totalLinePairs = numLinesHorizontal + numLinesVertical + lastPriceLines.length + 4;
            const requiredBufferLength = totalLinePairs * 6;

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

        let shiftY = this.chart.scrollY % lineDistanceHorizontal;

        if (shiftY < 0)
            shiftY += lineDistanceHorizontal;

        // Always rewrite positions so scroll shifts are applied every frame.
        const arr = this.gfxPositionBuffer.array as Float32Array;
        let idx = 0;

        // Horizontal lines, scrolled vertically.
        for (let i = 0; i < numLinesHorizontal; i++) {
            const y = bbox.min.y + ((chartHeight * (i / numLinesHorizontal) + shiftY) % chartHeight);
            arr[idx++] = bbox.min.x; arr[idx++] = y; arr[idx++] = 0;
            arr[idx++] = bbox.max.x; arr[idx++] = y; arr[idx++] = 0;
        }

        // Vertical lines, scrolled horizontally. Only every `verticalLineStride`-th bar gets a line,
        // so the spacing is `verticalGridLineDistance`. Positions are clamped to the chart, so no
        // line is ever drawn outside of it.
        for (const x of verticalLinePositions) {
            arr[idx++] = x; arr[idx++] = bbox.min.y; arr[idx++] = 0;
            arr[idx++] = x; arr[idx++] = bbox.max.y; arr[idx++] = 0;
        }

        // One extra horizontal line per price indicator, marking its last value.
        for (const line of lastPriceLines) {
            arr[idx++] = bbox.min.x; arr[idx++] = line.worldY; arr[idx++] = 0;
            arr[idx++] = bbox.max.x; arr[idx++] = line.worldY; arr[idx++] = 0;
        }

        // Border edges: top, bottom, left and right.
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = 0;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = 0;

        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = 0;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = 0;

        arr[idx++] = bbox.min.x; arr[idx++] = bbox.min.y; arr[idx++] = 0;
        arr[idx++] = bbox.min.x; arr[idx++] = bbox.max.y; arr[idx++] = 0;

        arr[idx++] = bbox.max.x; arr[idx++] = bbox.min.y; arr[idx++] = 0;
        arr[idx++] = bbox.max.x; arr[idx++] = bbox.max.y; arr[idx++] = 0;

        this.gfxPositionBuffer.needsUpdate = true;
        this.gfxGridLines.geometry.setDrawRange(0, idx / 3);
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
        label.textContent = '';

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
     * Formats the text of a horizontal grid line label for the given world-space Y coordinate.
     *
     * Price charts show the price at that level, using the symbol's precision. Charts without a
     * price indicator show the 0..100 indicator value instead.
     */
    private formatHorizontalLabel(worldY: number): string {
        if (this.chart.hasPriceIndicator)
            return this.chart.worldYToPrice(worldY).toFixed(this.chart.priceDigits);

        return (worldY / this.chart.chartHeight * 100).toFixed(2);
    }

    /**
     * Updates the labels of the chart grid.
     */
    public updateLabels(): void {
        // Ensuring capacity for the horizontal line labels on the left and right side of the chart.
        for (let i = this.labelsHorizontalLinesLeftDOM.childElementCount; i <= this.chart.maxHorizontalLines; i++) {
            let labelLeft = document.createElement('div');
            let labelRight = document.createElement('div');
            this.setLabelStyle(labelLeft, 'horizontal-left');
            this.setLabelStyle(labelRight, 'horizontal-right');
            this.setHorizontalLineLabel(i, '10');
            this.labelsHorizontalLinesLeftDOM.appendChild(labelLeft);
            this.labelsHorizontalLinesRightDOM.appendChild(labelRight);            
        }

        // Removing excessive horizontal line labels on the left and right side of the chart.
        while (this.labelsHorizontalLinesLeftDOM.childElementCount > this.chart.maxHorizontalLines) {
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
        // One extra label covers the case where a line lands exactly on the right edge.
        const numVerticalLabels = this.chart.numVerticalLines + 1;

        for (let i = this.labelsVerticalLinesBottomDOM.childElementCount; i < numVerticalLabels; i++) {
            const label = document.createElement('div');
            this.setLabelStyle(label, 'vertical');
            this.setVerticalLineLabel(i, '2 may 2027');
            this.labelsVerticalLinesBottomDOM.appendChild(label);
        }
        
        // Removing excessive vertical line labels at the bottom of the chart.
        while (this.labelsVerticalLinesBottomDOM.childElementCount > numVerticalLabels) {
            let label = this.labelsVerticalLinesBottomDOM.lastChild;
            if (label && label.parentElement) {
                label.parentElement.removeChild(label);
            }
        }

        // Ensuring capacity for the last-price labels of each price indicator.
        const numLastPriceLabels = this.chart.lastPriceLines.length;

        for (let i = this.labelsLastPriceDOM.childElementCount; i < numLastPriceLabels; i++) {
            const label = document.createElement('div');
            this.setLabelStyle(label, 'horizontal-right');
            label.style.pointerEvents = 'auto';
            label.style.cursor = 'default';
            this.labelsLastPriceDOM.appendChild(label);
        }

        // Removing excessive last-price labels.
        while (this.labelsLastPriceDOM.childElementCount > numLastPriceLabels) {
            const label = this.labelsLastPriceDOM.lastChild;
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

        if (this.labelsLastPriceDOM.parentElement === null) {
            this.labelsDOM.appendChild(this.labelsLastPriceDOM);
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
        const numLinesHorizontal = this.chart.maxHorizontalLines;
        const lineDistanceHorizontal = chartHeight / numLinesHorizontal;

        let shiftY = this.chart.scrollY % lineDistanceHorizontal;
        if (shiftY < 0)
            shiftY += lineDistanceHorizontal;

        // Bars are rendered offset by scrollY (see Chart.updateScroll()), so a line drawn at a given
        // world-space level currently shows whatever price is `scrollY` below its own price.
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
            const price = this.formatHorizontalLabel(bbox.min.y + (i - scrolledLevels) * lineDistanceHorizontal);

            // Without a price indicator there is no price axis, so the horizontal labels are hidden.
            if (!this.chart.hasPriceIndicator) {
                this.applyLabelState(labelLeft, 0, 0, 0, false, '');
                this.applyLabelState(labelRight, 0, 0, 0, false, '');
                continue;
            }

            this._tempVector.set(bbox.min.x, y, 0);
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

            this._tempVector.set(bbox.max.x, y, 0);
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
        // Uses the exact same positions as layoutGridLines(), so labels always sit on their lines.
        const verticalLinePositions = this.getVerticalLinePositions();

        for (let i = 0; i < verticalLinePositions.length; i++) {
            const label = this.labelsVerticalLinesBottomDOM.children[i] as HTMLDivElement;

            if (!label)
                continue;

            const effectiveX = verticalLinePositions[i];

            // Fade out the label as it approaches the left or right edge of the chart, same as the grid lines.
            const distToEdgeX = Math.min(effectiveX - bbox.min.x, bbox.max.x - effectiveX);
            const labelAlpha = this.computeEdgeFadeAlphaLabels(distToEdgeX, this.chart.initialVerticalLineDistance);

            const dateText = this.getNearestBarDateLabel(effectiveX);

            this._tempVector.set(effectiveX, bbox.min.y, 0);
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

        this.updateLastPriceLabels(bbox, clientWidth, clientHeight);
    }

    /**
     * Positions the last-price labels of each price indicator on the right side of the chart and
     * wires up their hover tooltip.
     */
    private updateLastPriceLabels(bbox: Gfx.Box3, clientWidth: number, clientHeight: number): void {
        const lastPriceLines = this.chart.lastPriceLines;

        // The tooltip is only attached once, and only when there is something to hover.
        if (lastPriceLines.length > 0 && !this.lastPriceHoverAttached) {
            this.domLastPriceHover.classList.add('chart-tooltip');
            this.domLastPriceHover.style.display = 'none';
            document.body.appendChild(this.domLastPriceHover);
            document.addEventListener('mousemove', this.positionLastPriceHover);
            this.lastPriceHoverAttached = true;
        }

        for (let i = 0; i < lastPriceLines.length; i++) {
            const label = this.labelsLastPriceDOM.children[i] as HTMLDivElement | undefined;

            if (!label)
                continue;

            const line = lastPriceLines[i];

            // The label follows the line, which is fixed in world space (it does not scroll).
            this._tempVector.set(bbox.max.x, line.worldY, 0);
            this._tempVector.applyMatrix4(this.chart.matrixWorld);
            this._tempVector.project(RendererRenderPass.Current!.camera!.native);

            const visible = this._tempVector.z <= 1;
            const text = line.value.toFixed(this.chart.priceDigits);

            if (visible) {
                const screenX = (this._tempVector.x + 1) * 0.5 * clientWidth;
                const screenY = (1 - this._tempVector.y) * 0.5 * clientHeight;

                this.applyLabelState(label, screenX, screenY, 1, true, text);
            }
            else {
                this.applyLabelState(label, 0, 0, 0, false, text);
            }

            // Color the label like its indicator so it can be told apart from the grid labels.
            const colorCss = `#${line.color.toString(16).padStart(6, '0')}`;

            if (label.dataset.color !== colorCss) {
                label.style.color = colorCss;
                label.dataset.color = colorCss;
            }

            // The handler is installed once per label and resolves the line by index at hover time,
            // so it always shows the current value instead of a stale closure.
            if (label.dataset.hoverBound !== '1') {
                label.dataset.hoverBound = '1';

                label.addEventListener('mouseenter', () => {
                    const current = this.chart.lastPriceLines[Number(label.dataset.lineIndex ?? -1)];

                    if (!current)
                        return;

                    this.domLastPriceHover.innerHTML =
                        `Indicator: ${current.name}<br>Last value: ${current.value.toFixed(this.chart.priceDigits)}`;
                    this.domLastPriceHover.style.display = 'block';
                });

                label.addEventListener('mouseleave', () => {
                    this.domLastPriceHover.style.display = 'none';
                });
            }

            label.dataset.lineIndex = String(i);
        }

        if (lastPriceLines.length === 0 && this.lastPriceHoverAttached)
            this.domLastPriceHover.style.display = 'none';
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
        const r = 0x08 / 0xff;
        const g = 0x08 / 0xff;
        const b = 0x08 / 0xff;

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

        // Last-price lines are drawn after the horizontal and vertical grid lines. They use the
        // indicator's own color and are never faded, so they stay readable at the chart edges.
        const lastPriceLines = this.chart.lastPriceLines;
        const lastPriceStartVertex = (this.chart.maxHorizontalLines + this.getVerticalLinePositions().length) * 2;

        for (let i = 0; i < lastPriceLines.length; i++) {
            const vi = lastPriceStartVertex + i * 2;

            if (vi + 1 >= vertexCount)
                break;

            const color = lastPriceLines[i].color;

            const lr = ((color >> 16) & 0xff) / 0xff;
            const lg = ((color >> 8) & 0xff) / 0xff;
            const lb = (color & 0xff) / 0xff;

            col[vi * 4]     = lr; col[vi * 4 + 1]     = lg; col[vi * 4 + 2]     = lb; col[vi * 4 + 3]     = 1.0;
            col[(vi+1) * 4] = lr; col[(vi+1) * 4 + 1] = lg; col[(vi+1) * 4 + 2] = lb; col[(vi+1) * 4 + 3] = 1.0;
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