import * as Gfx                   from 'three';
import { RendererPlugin }          from '../../RendererPlugin';
import { Known }                   from '@shared/api/Known';
import type { RendererRenderPass } from '../../RendererRenderPass';
import type { Chart }              from '../../objects/Chart';

export interface ChartGridLabelsPluginOptions {
    chart: Chart;
}

const LABEL_CSS = [
    'position:absolute',
    'font-size:12px',
    'font-family:monospace',
    'color:#aaaaaa',
    'white-space:nowrap',
    'background:rgba(10,10,10,0.75)',
    'padding:1px 4px',
    'border-radius:2px',
    'line-height:1.4',
    'pointer-events:none',
].join(';');

/**
 * Renders HTML <div> price and date/time labels anchored to the chart grid lines.
 * Labels are projected from 3D world space each frame so they stay flat and
 * size-independent of camera rotation.
 */
@Known.class('BuiltIn.ChartGridLabelsPlugin')
export class ChartGridLabelsPlugin extends RendererPlugin<ChartGridLabelsPluginOptions>
{
    private _chart: Chart;
    private _labelContainer: HTMLDivElement | null = null;
    private _priceLabels: HTMLDivElement[] = [];
    private _dateLabels: HTMLDivElement[] = [];
    private _ohlcLabel: HTMLDivElement | null = null;

    // Reused scratch vector to avoid per-frame allocations.
    private _v = new Gfx.Vector3();

    // Last known mouse position relative to the canvas container.
    private _mouseX: number = 0;
    private _mouseY: number = 0;

    private _onMouseMove = (e: MouseEvent): void => {
        const rect = this.renderer.container?.getBoundingClientRect();
        if (!rect) return;
        this._mouseX = e.clientX - rect.left;
        this._mouseY = e.clientY - rect.top;
    };

    public constructor(rendererPass: RendererRenderPass, options: ChartGridLabelsPluginOptions) {
        super(rendererPass, options);
        this._chart = options.chart;
    }

    /** @inheritdoc */
    public override mounted(canvas: HTMLCanvasElement): void {
        this._labelContainer = document.createElement('div');
        this._labelContainer.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
        canvas.parentElement?.appendChild(this._labelContainer);
        canvas.addEventListener('mousemove', this._onMouseMove);
    }

    /** @inheritdoc */
    public override unmounted(canvas: HTMLCanvasElement): void {
        canvas.removeEventListener('mousemove', this._onMouseMove);
        this._labelContainer?.remove();
        this._labelContainer = null;
        this._priceLabels = [];
        this._dateLabels = [];
        this._ohlcLabel = null;
    }

    /** @inheritdoc */
    public override update(renderPass: RendererRenderPass): void {
        const camera    = renderPass.camera;
        const container = this.renderer.container;
        if (!camera || !container || !this._labelContainer) return;

        const nativeCam = camera.native;
        const W = container.clientWidth;
        const H = container.clientHeight;

        const chart  = this._chart;
        const grid   = chart.grid;
        const bbox   = chart.getBBox();
        const cw     = bbox.max.x - bbox.min.x;
        const ch     = bbox.max.y - bbox.min.y;

        const NUM_H = 10;                             // horizontal (price) lines per face
        const NUM_V = chart.numHorizontalGridLines;   // vertical (time) lines

        const shiftY = ch > 0 ? ((-grid.gridLinesShiftY % ch) + ch) % ch : 0;
        const shiftX = cw > 0 ? ((-grid.gridLinesShiftX % cw) + cw) % cw : 0;

        // ------------------------------------------------------------------
        // Price labels — one per front-face horizontal line, on the left side
        // ------------------------------------------------------------------
        let activePriceCount = 0;

        for (let i = 0; i <= NUM_H; i++) {
            const y = bbox.min.y + ((ch * (i / NUM_H) + shiftY) % ch);

            this._v.set(bbox.min.x, y, bbox.max.z);
            this._v.applyMatrix4(chart.matrixWorld);
            this._v.project(nativeCam);

            if (this._v.z > 1) continue; // behind camera

            const sx = (this._v.x + 1) * 0.5 * W;
            const sy = (1 - this._v.y) * 0.5 * H;

            if (sy < -20 || sy > H + 20) continue; // well off-screen vertically

            const lbl = this._getOrCreate(this._priceLabels, activePriceCount++, 'right');
            lbl.textContent = y.toFixed(5);
            lbl.style.display  = 'block';
            lbl.style.left     = `${sx - 74}px`; // 70px wide + 4px gap
            lbl.style.top      = `${sy - 8}px`;  // vertically centred on the line
        }

        this._hideExcess(this._priceLabels, activePriceCount);

        // ------------------------------------------------------------------
        // Date/time labels — one per front-face vertical line, below the chart
        // ------------------------------------------------------------------
        const series     = chart.series[0] ?? null;
        const numBars    = series ? series.getNumBars() : 0;
        let activeDateCount = 0;

        const gridSpacingX = NUM_V > 0 ? cw / NUM_V : cw;

        for (let i = 0; i < NUM_V; i++) {
            const x = bbox.min.x + ((cw * (i / NUM_V) + shiftX) % cw);

            this._v.set(x, bbox.min.y, bbox.max.z);
            this._v.applyMatrix4(chart.matrixWorld);
            this._v.project(nativeCam);

            if (this._v.z > 1) continue;

            const sx = (this._v.x + 1) * 0.5 * W;
            const sy = (1 - this._v.y) * 0.5 * H;

            if (sx < -40 || sx > W + 40) continue;

            // Find the bar whose world-x is closest to this grid line.
            let time_ms: number | null = null;
            if (series && numBars > 0) {
                let minDist = Infinity;
                for (let b = 0; b < numBars; b++) {
                    const bar  = series.bars[b];
                    const dist = Math.abs(series.position.x + bar.posX - x);
                    if (dist < minDist) {
                        minDist = dist;
                        time_ms = bar.time_ms;
                    }
                }
                // Skip this grid line if no bar is within half a grid cell.
                if (minDist > gridSpacingX * 0.5) continue;
            } else {
                continue;
            }

            const lbl = this._getOrCreate(this._dateLabels, activeDateCount++, 'center');
            lbl.textContent    = time_ms !== null ? ChartGridLabelsPlugin._formatDate(time_ms) : '?';
            lbl.style.display  = 'block';
            lbl.style.left     = `${sx - 34}px`; // centre 68px-wide label on x
            lbl.style.top      = `${sy + 4}px`;
        }

        this._hideExcess(this._dateLabels, activeDateCount);

        // ------------------------------------------------------------------
        // OHLC tooltip — follows the selected bar's right edge, centred on its body
        // ------------------------------------------------------------------
        let selectedBar = null;
        for (const s of chart.series) {
            for (let b = 0; b < s.getNumBars(); b++) {
                if (s.bars[b].hovered) { selectedBar = s.bars[b]; break; }
            }
            if (selectedBar) break;
        }

        if (selectedBar) {
            if (!this._ohlcLabel) {
                this._ohlcLabel = document.createElement('div');
                this._ohlcLabel.style.cssText = LABEL_CSS;
                this._labelContainer!.appendChild(this._ohlcLabel);
            }

            const bar = selectedBar;
            this._ohlcLabel.innerHTML =
                `<span style="color:#888">O</span> ${bar.o.toFixed(5)}<br>` +
                `<span style="color:#888">H</span> ${bar.h.toFixed(5)}<br>` +
                `<span style="color:#888">L</span> ${bar.l.toFixed(5)}<br>` +
                `<span style="color:#888">C</span> ${bar.c.toFixed(5)}`;
            this._ohlcLabel.style.display = 'block';
            // Offset so the tooltip doesn't sit directly under the cursor.
            this._ohlcLabel.style.left = `${this._mouseX + 14}px`;
            this._ohlcLabel.style.top  = `${this._mouseY - this._ohlcLabel.offsetHeight / 2}px`;
        } else if (this._ohlcLabel) {
            this._ohlcLabel.style.display = 'none';
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private _getOrCreate(pool: HTMLDivElement[], index: number, align: 'right' | 'center'): HTMLDivElement {
        if (index < pool.length) return pool[index];

        const div = document.createElement('div');
        div.style.cssText   = LABEL_CSS;
        div.style.textAlign = align;
        this._labelContainer!.appendChild(div);
        pool.push(div);
        return div;
    }

    private _hideExcess(pool: HTMLDivElement[], activeCount: number): void {
        for (let i = activeCount; i < pool.length; i++)
            pool[i].style.display = 'none';
    }

    private static _formatDate(time_ms: number): string {
        const d  = new Date(time_ms);
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mn = String(d.getMinutes()).padStart(2, '0');
        return `${mo}/${dd} ${hh}:${mn}`;
    }
}
