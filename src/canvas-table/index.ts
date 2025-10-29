/**
 * @author Lalit <lalitkhudania1@gmail.com>
 * @description High-performance data table with Canvas (DPR-fixed version).
 */

import { debounce, throttle } from "../utils";
import "./style.css";

/* ============================= TYPE DEFINITIONS ============================= */
export interface GridConfig {
  cellHeight: number;
  viewHeight: number;
  cellWidth: number; // Exact width of one column (e.g. 150px)
  viewWidth: number; // Width of visible viewport
}

export interface ColumnDefinition {
  label: string;
  identifier: string;
}

/* =========================================================================== */
export class CanvasTable {
  // DOM & Data
  private container: HTMLElement;
  private columns: ColumnDefinition[];
  private config: GridConfig;
  private data: string[][] = [];

  // Layout
  private readonly SCROLL_STEP = 3;
  private viewWindowRow = { start: 0, end: 0 };
  private visibleCount = { verticalCount: 0 };

  // Canvas
  private gridCanvas!: HTMLCanvasElement;
  private textCanvas!: HTMLCanvasElement;
  private gridCtx!: CanvasRenderingContext2D;
  private textCtx!: CanvasRenderingContext2D;

  // UI Elements
  private headerContainer!: HTMLElement;
  private scrollbarTrack!: HTMLElement;
  private scrollbarThumb!: HTMLElement;

  // Scrollbar Drag
  private isThumbDragging = false;
  private dragStartY = 0;

  // Auto Scroll (for testing)
  private autoScrollId: number | null = null;
  private lastScrollTime = 0;
  private readonly scrollDelay = 2;

  /* ============================== CONSTRUCTOR ============================== */
  constructor(
    container: HTMLElement,
    columns: ColumnDefinition[],
    config: GridConfig
  ) {
    this.container = container;
    this.columns = columns;
    this.config = { ...config };
    this.setupEventListeners();
  }

  /* =========================== EVENT LISTENERS =========================== */
  private setupEventListeners(): void {
    this.container.addEventListener(
      "wheel",
      throttle((e: WheelEvent) => {
        e.preventDefault();
        if (!e.shiftKey && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
          this.handleScrollY(e.deltaY);
          this.syncThumbPositionWithScroll();
        }
      }, 16),
      { passive: false }
    );
  }

  /* ============================= SCROLL LOGIC ============================= */
  private handleScrollY(delta: number): void {
    this.scrollToRow(
      this.viewWindowRow.start +
        (delta > 0 ? this.SCROLL_STEP : -this.SCROLL_STEP)
    );
  }

  private scrollToRow(start: number): void {
    const max = Math.max(0, this.data.length - this.visibleCount.verticalCount);
    const newStart = Math.max(0, Math.min(start, max));
    if (newStart === this.viewWindowRow.start) return;

    this.viewWindowRow.start = newStart;
    this.viewWindowRow.end = Math.min(
      newStart + this.visibleCount.verticalCount,
      this.data.length
    );
    this.updateVisibleCells();
    this.syncThumbPositionWithScroll();
  }

  private syncThumbPositionWithScroll(): void {
    if (!this.scrollbarThumb || !this.scrollbarTrack || this.data.length === 0)
      return;

    const totalRows = this.data.length;
    const visibleRows = this.viewWindowRow.end - this.viewWindowRow.start;
    const maxScrollable = totalRows - visibleRows;
    const maxThumbTop =
      this.scrollbarTrack.clientHeight - this.scrollbarThumb.clientHeight;

    if (maxScrollable <= 0 || maxThumbTop <= 0) {
      this.scrollbarThumb.style.top = "0px";
      return;
    }

    const ratio = this.viewWindowRow.start / maxScrollable;
    const thumbTop = ratio * maxThumbTop;
    this.scrollbarThumb.style.top = `${Math.max(
      0,
      Math.min(thumbTop, maxThumbTop)
    )}px`;
  }

  /* ========================== LAYOUT CALCULATION ========================== */
  private calculateVisibleCount(): void {
    this.visibleCount.verticalCount = Math.ceil(
      this.config.viewHeight / this.config.cellHeight
    );
  }

  /* =============================== SCROLLBAR =============================== */
  private generateScrollbar(): string {
    const trackHeight = this.config.viewHeight;
    const totalHeight = this.data.length * this.config.cellHeight;
    const thumbHeight = Math.max(
      20,
      (this.config.viewHeight * this.config.viewHeight) / totalHeight
    );

    return `
      <div id="table-scrollbar-track" class="scrollbar-track" style="height:${trackHeight}px;">
        <div id="table-scrollbar-thumb" class="scrollbar-thumb" style="height:${thumbHeight}px;"></div>
      </div>
    `;
  }

  /* ============================== HEADER UI =============================== */
  private updateHeader(): void {
    if (!this.headerContainer) return;
    this.headerContainer.innerHTML = this.columns
      .map((col) => `<div class="header-cell">${col.label}</div>`)
      .join("");
  }

  private generateTableHTML(): string {
    const totalColumns = this.columns.length;
    const fullTableWidth = totalColumns * this.config.cellWidth;

    return `
      <div class="canvas-table-wrapper">
        ${this.generateScrollbar()}
        <div class="header-wrapper">
          <div 
            class="header-container" 
            id="header-container"
            style="
              display: grid;
              grid-template-columns: repeat(${totalColumns}, ${
      this.config.cellWidth
    }px);
              width: ${fullTableWidth}px;
              box-sizing: border-box;
            ">
          </div>
        </div>
        <div class="canvas-wrapper">
          <canvas 
            id="text-canvas" 
            class="table-canvas"
            style="
              display: block;
              width: ${fullTableWidth}px;
              height: ${this.config.viewHeight}px;
              image-rendering: pixelated;
            ">
          </canvas>
        </div>
      </div>
    `;
  }

  /* ============================ CANVAS RENDERING =========================== */
  private renderStaticGrid(): void {
    const { cellWidth, cellHeight, viewHeight } = this.config;
    const verticalCount = this.visibleCount.verticalCount;
    const fullWidth = this.columns.length * cellWidth;

    const dpr = window.devicePixelRatio || 1;

    this.gridCanvas.width = fullWidth * dpr;
    this.gridCanvas.height = viewHeight * dpr;
    this.gridCtx.scale(dpr, dpr);

    const ctx = this.gridCtx;
    ctx.clearRect(0, 0, fullWidth, viewHeight);
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;

    for (let r = 0; r < verticalCount; r++) {
      for (let c = 0; c < this.columns.length; c++) {
        const x = c * cellWidth;
        const y = r * cellHeight;
        ctx.strokeRect(x, y, cellWidth, cellHeight);
      }
    }
  }

  private renderTextLayer(): void {
    const { cellWidth, cellHeight, viewHeight } = this.config;
    const fullWidth = this.columns.length * cellWidth;
    const ctx = this.textCtx;
    const dpr = window.devicePixelRatio || 1;

    this.textCanvas.width = fullWidth * dpr;
    this.textCanvas.height = viewHeight * dpr;
    this.textCanvas.style.width = `${fullWidth}px`;
    this.textCanvas.style.height = `${viewHeight}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform before scaling
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, fullWidth, viewHeight);
    ctx.drawImage(
      this.gridCanvas,
      0,
      0,
      fullWidth * dpr,
      viewHeight * dpr,
      0,
      0,
      fullWidth,
      viewHeight
    );

    ctx.font = `${13}px Arial`;
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const rowStart = this.viewWindowRow.start;
    const rowEnd = this.viewWindowRow.end;
    const maxTextWidth = cellWidth - 12;

    for (let localRow = 0; localRow < rowEnd - rowStart; localRow++) {
      const globalRow = rowStart + localRow;
      const rowData = this.data[globalRow];
      if (!rowData) continue;

      const y = localRow * cellHeight + cellHeight / 2;

      for (let c = 0; c < this.columns.length; c++) {
        const text = rowData[c] ?? "";
        if (!text) continue;

        const x = c * cellWidth + cellWidth / 2;
        const fullWidthPx = ctx.measureText(text).width;

        if (fullWidthPx <= maxTextWidth) {
          ctx.fillText(text, x, y);
          continue;
        }

        const avgCharWidth = fullWidthPx / text.length;
        const estChars = Math.max(
          0,
          Math.floor(maxTextWidth / avgCharWidth) - 3
        );
        const displayText =
          estChars > 0 ? text.slice(0, estChars) + "..." : "...";
        ctx.fillText(displayText, x, y);
      }
    }
  }

  /* =========================== SCROLLBAR DRAG =========================== */
  private attachScrollbarEventListeners(): void {
    this.scrollbarThumb.addEventListener(
      "mousedown",
      this.onThumbMouseDown.bind(this)
    );
    document.addEventListener("mouseup", this.onMouseUp.bind(this));
    document.addEventListener("mousemove", this.onMouseMove.bind(this));
  }

  private onThumbMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.isThumbDragging = true;
    this.container.style.userSelect = "none";
    this.dragStartY =
      e.clientY - this.scrollbarThumb.getBoundingClientRect().top;
  }

  private onMouseUp(): void {
    if (this.isThumbDragging) {
      this.isThumbDragging = false;
      this.container.style.userSelect = "auto";
    }
  }

  private onMouseMove = debounce((e: MouseEvent) => {
    if (!this.isThumbDragging) return;
    this.updateThumbPosition(e);
  }, 5);

  private updateThumbPosition(e: MouseEvent): void {
    const trackRect = this.scrollbarTrack.getBoundingClientRect();
    const maxTop = trackRect.height - this.scrollbarThumb.clientHeight;
    let newTop = e.clientY - trackRect.top - this.dragStartY;
    newTop = Math.max(0, Math.min(newTop, maxTop));
    this.scrollbarThumb.style.top = `${newTop}px`;

    const ratio = newTop / maxTop;
    const maxStartRow = this.data.length - this.visibleCount.verticalCount;
    const targetRow = Math.floor(ratio * maxStartRow);
    this.scrollToRow(targetRow);
  }

  /* ============================ AUTO SCROLL ============================ */
  public startAutoScroll(): void {
    if (this.autoScrollId !== null) return;

    this.lastScrollTime = performance.now();
    const loop = (time: DOMHighResTimeStamp) => {
      if (time - this.lastScrollTime >= this.scrollDelay) {
        this.handleScrollY(this.SCROLL_STEP);
        this.lastScrollTime = time;
      }
      const maxStart = Math.max(
        0,
        this.data.length - this.visibleCount.verticalCount
      );
      if (this.viewWindowRow.start < maxStart) {
        this.autoScrollId = requestAnimationFrame(loop);
      } else {
        this.stopAutoScroll();
      }
    };
    this.autoScrollId = requestAnimationFrame(loop);
  }

  public stopAutoScroll(): void {
    if (this.autoScrollId !== null) {
      cancelAnimationFrame(this.autoScrollId);
      this.autoScrollId = null;
    }
  }

  /* =============================== PUBLIC API =============================== */
  public loadData(data: string[][]): void {
    this.data = data;
    this.calculateVisibleCount();
    this.viewWindowRow = {
      start: 0,
      end: Math.min(this.visibleCount.verticalCount, data.length),
    };
  }

  public render(): void {
    this.container.innerHTML = this.generateTableHTML();

    this.headerContainer = this.container.querySelector("#header-container")!;
    this.updateHeader();

    this.textCanvas = this.container.querySelector("#text-canvas")!;
    this.textCtx = this.textCanvas.getContext("2d")!;

    this.gridCanvas = document.createElement("canvas");
    this.gridCtx = this.gridCanvas.getContext("2d")!;

    this.renderStaticGrid();
    this.renderTextLayer();

    this.scrollbarTrack = this.container.querySelector(
      "#table-scrollbar-track"
    )!;
    this.scrollbarThumb = this.container.querySelector(
      "#table-scrollbar-thumb"
    )!;
    this.attachScrollbarEventListeners();
  }

  public updateVisibleCells(): void {
    this.renderTextLayer();
  }

  public resize(width: number, height: number): void {
    this.config.viewWidth = width;
    this.config.viewHeight = height;
    this.calculateVisibleCount();
    this.scrollToRow(this.viewWindowRow.start);
    this.renderStaticGrid();
    this.updateHeader();
    this.renderTextLayer();
    this.syncThumbPositionWithScroll();
  }

  public destroy(): void {
    document.querySelector(".canvas-table-wrapper")?.remove();
  }
}
