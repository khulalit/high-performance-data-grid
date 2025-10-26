/**
 * @author Lalit <lalitkhudania1@gmail.com>
 * @description High-performance data table with Canvas.
 *
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
  private data: string[][] = []; // Supports string[][]

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

  // Auto Scroll (for performance testing)
  private autoScrollId: number | null = null;
  private lastScrollTime = 0;
  private readonly scrollDelay = 2; // ~500 FPS cap

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
  /** Sets up wheel scrolling (vertical only) */
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
  /** Handles vertical wheel delta */
  private handleScrollY(delta: number): void {
    this.scrollToRow(
      this.viewWindowRow.start +
        (delta > 0 ? this.SCROLL_STEP : -this.SCROLL_STEP)
    );
  }

  /** Updates visible row window and redraws */
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

  /** Syncs custom scrollbar thumb with current scroll */
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
  /** Calculates how many rows fit in viewport */
  private calculateVisibleCount(): void {
    this.visibleCount.verticalCount = Math.ceil(
      this.config.viewHeight / this.config.cellHeight
    );
  }

  /* =============================== SCROLLBAR =============================== */
  /** Generates vertical scrollbar HTML */
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
  /** Updates header with column labels */
  private updateHeader(): void {
    if (!this.headerContainer) return;
    this.headerContainer.innerHTML = this.columns
      .map((col) => `<div class="header-cell">${col.label}</div>`)
      .join("");
  }

  /** Generates full table HTML structure */
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
  /** Renders static grid lines (offscreen) */
  private renderStaticGrid(): void {
    const { cellWidth, cellHeight } = this.config;
    const verticalCount = this.visibleCount.verticalCount;
    const fullWidth = this.columns.length * cellWidth;

    this.gridCanvas.width = fullWidth;
    this.gridCanvas.height = this.config.viewHeight;

    const ctx = this.gridCtx;
    ctx.clearRect(0, 0, fullWidth, this.config.viewHeight);
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

  /** Renders text with ellipsis for overflow */
  private renderTextLayer(): void {
    const { cellWidth, cellHeight } = this.config;
    const fullWidth = this.columns.length * cellWidth;
    const ctx = this.textCtx;

    this.textCanvas.width = fullWidth;
    this.textCanvas.height = this.config.viewHeight;

    ctx.clearRect(0, 0, fullWidth, this.config.viewHeight);
    ctx.drawImage(this.gridCanvas, 0, 0);

    ctx.font = "13px Arial";
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const rowStart = this.viewWindowRow.start;
    const rowEnd = this.viewWindowRow.end;
    const maxTextWidth = cellWidth - 12; // 6px padding

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
  /** Attaches drag handlers to custom scrollbar */
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

  /* ============================ AUTO SCROLL (TEST) ========================= */
  /** Starts smooth auto-scrolling for performance testing */
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

  /** Stops auto-scrolling */
  public stopAutoScroll(): void {
    if (this.autoScrollId !== null) {
      cancelAnimationFrame(this.autoScrollId);
      this.autoScrollId = null;
    }
  }

  /* =============================== PUBLIC API =============================== */
  /** Loads data (supports string[][]) */
  public loadData(data: string[][]): void {
    this.data = data;
    this.calculateVisibleCount();
    this.viewWindowRow = {
      start: 0,
      end: Math.min(this.visibleCount.verticalCount, data.length),
    };
  }

  /** Renders the table */
  public render(): void {
    this.container.innerHTML = this.generateTableHTML();

    this.headerContainer = this.container.querySelector("#header-container")!;
    this.updateHeader();

    this.textCanvas = this.container.querySelector("#text-canvas")!;
    this.textCtx = this.textCanvas.getContext("2d")!;

    this.gridCanvas = document.createElement("canvas");
    this.gridCtx = this.gridCanvas.getContext("2d")!;

    const fullWidth = this.columns.length * this.config.cellWidth;

    // Critical: canvas pixel buffer = full width
    this.textCanvas.width = fullWidth;
    this.textCanvas.height = this.config.viewHeight;
    this.textCanvas.style.width = `${fullWidth}px`; // No scaling

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

  /** Redraws only visible cells */
  public updateVisibleCells(): void {
    this.renderTextLayer();
  }

  /** Resizes viewport */
  public resize(width: number, height: number): void {
    this.config.viewWidth = width;
    this.config.viewHeight = height;

    this.calculateVisibleCount();
    this.scrollToRow(this.viewWindowRow.start);

    const fullWidth = this.columns.length * this.config.cellWidth;

    this.textCanvas.width = fullWidth;
    this.textCanvas.height = height;
    this.textCanvas.style.width = `${fullWidth}px`;
    this.textCanvas.style.height = `${height}px`;

    this.renderStaticGrid();
    this.updateHeader();
    this.renderTextLayer();
    this.syncThumbPositionWithScroll();
  }

  public destroy() {
    document.querySelector(".canvas-table-wrapper")?.remove();
  }

  /* ============================= TODO / FUTURE ============================= */
  // TODO: Add Horizontal virtualization
  // TODO: Add column resizing
  // TODO: Add sticky first column
  // TODO: Add row selection
  // TODO: Add keyboard navigation
  // TODO: Add column sorting
}
