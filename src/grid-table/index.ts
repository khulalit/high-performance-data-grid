/**
 * @author Lalit <lalitkhudania1@gmail.com>
 * @description High-performance data table.
 *
 */

import { debounce, throttle } from "../utils";
import "./style.css";

/* ----------------------------- Type Definitions ---------------------------- */

export interface GridConfig {
  cellHeight: number;
  viewHeight: number;
  cellWidth: number;
}

export interface ColumnDefinition {
  label: string;
  identifier: string;
}

export interface RowData {
  [key: string]: any;
}

/* ----------------------------- Grid Table Class ---------------------------- */

export class GridTable {
  private container: HTMLElement;
  private config: GridConfig;
  private data: RowData[] = [];
  private columns: ColumnDefinition[];

  private renderedCells: HTMLElement[] = [];
  private viewWindow: { start: number; end: number; visibleCount: number };
  private filteredData: RowData[] = [];

  // Scrollbar elements
  private scrollbarTrack!: HTMLElement;
  private scrollbarThumb!: HTMLElement;

  // Scroll handling
  private isThumbDragging = false;
  private dragStartY = 0;
  private SCROLL_STEP = 4;

  // Render optimization flag
  private isFrameUpdateScheduled = false;

  // Auto-scroll properties
  private autoScrollId: number | null = null;
  private lastScrollTime: number = 0;
  private scrollDelay: number = 2;

  constructor(
    container: HTMLElement,
    columns: ColumnDefinition[],
    config: GridConfig
  ) {
    this.container = container;
    this.columns = columns;
    this.config = config;

    this.viewWindow = {
      start: 0,
      end: Math.floor(config.viewHeight / config.cellHeight) - 2,
      visibleCount: Math.floor(config.viewHeight / config.cellHeight) - 2,
    };

    // Listen for mouse wheel scrolls
    this.container.addEventListener(
      "wheel",
      throttle((event: WheelEvent) => {
        if (event.deltaY !== 0) {
          event.preventDefault();
          this.handleScroll(event.deltaY);
        }
      }, 16), // Approximately 60fps
      { passive: false }
    );
  }

  /* ------------------------------ Scroll Logic ------------------------------ */

  private handleScroll(scrollDelta: number): void {
    const totalRows = this.data.length;

    // Prevent overscrolling beyond data limits
    if (
      (scrollDelta < 0 && this.viewWindow.start === 0) ||
      (scrollDelta > 0 && this.viewWindow.end === totalRows - 1)
    ) {
      return;
    }

    if (scrollDelta < 0) {
      this.viewWindow.start -= this.SCROLL_STEP;
      this.viewWindow.end -= this.SCROLL_STEP;
    } else {
      this.viewWindow.start += this.SCROLL_STEP;
      this.viewWindow.end += this.SCROLL_STEP;
    }

    this.viewWindow.start = Math.max(0, this.viewWindow.start);
    this.viewWindow.end = Math.min(totalRows + 1, this.viewWindow.end);

    if (this.isFrameUpdateScheduled) return;
    this.isFrameUpdateScheduled = true;
    requestAnimationFrame(() => {
      this.isFrameUpdateScheduled = false;
      this.updateVisibleCells();
      this.syncThumbPositionWithScroll();
    });
  }

  /** Sync scrollbar thumb position with table view window */
  private syncThumbPositionWithScroll(): void {
    if (!this.scrollbarThumb || !this.scrollbarTrack || this.data.length === 0)
      return;

    const totalRows = this.data.length;
    const visibleRows = this.viewWindow.end - this.viewWindow.start;
    const maxScrollableIndex = totalRows - visibleRows;
    const maxThumbTop =
      this.scrollbarTrack.clientHeight - this.scrollbarThumb.clientHeight;

    if (maxScrollableIndex <= 0 || maxThumbTop <= 0) {
      this.scrollbarThumb.style.top = "0px";
      return;
    }

    const scrollRatio = this.viewWindow.start / maxScrollableIndex;
    let thumbTop = scrollRatio * maxThumbTop;
    thumbTop = Math.max(0, Math.min(thumbTop, maxThumbTop));

    this.scrollbarThumb.style.top = `${thumbTop}px`;
  }

  /* -------------------------- Table Render & Update -------------------------- */

  private generateAndRenderMarkup(): void {
    const headerMarkup = this.columns
      .map((col) => this.createHeaderCell(col.label))
      .join("");

    const searchRowMarkup = this.columns
      .map((col, idx) =>
        this.createSearchCell(`Search ${col.label}`, idx.toString())
      )
      .join("");

    const cellMarkup = this.generateVisibleCellMarkup();

    const tableMarkup = `
      <div class="table" id="table" 
        style="height:${this.config.viewHeight}px;
               grid-template-columns: repeat(${this.columns.length}, 1fr);">
        ${headerMarkup}
        ${searchRowMarkup}
        ${cellMarkup}
        ${this.generateScrollbar()}
      </div>
    `;

    this.container.innerHTML = tableMarkup;

    // Cache references to cells
    this.container.querySelectorAll(".table-cell").forEach((cell) => {
      this.renderedCells.push(cell as HTMLElement);
    });
  }

  private generateVisibleCellMarkup(): string {
    let markup = "";
    for (
      let rowIndex = this.viewWindow.start;
      rowIndex <= this.viewWindow.end;
      rowIndex++
    ) {
      for (let colIndex = 0; colIndex < this.columns.length; colIndex++) {
        markup += this.createTableCell(
          this.data[rowIndex]?.[colIndex],
          "table-cell content-cell"
        );
      }
    }
    return markup;
  }

  /** Updates the visible cell content (based on scroll or search) */
  private updateVisibleCells(): void {
    const activeData = this.areSearchInputsEmpty()
      ? this.data
      : this.filteredData;

    const { start, end } = this.viewWindow;
    const visibleRows = activeData.slice(start, end);

    for (let i = 0; i < this.renderedCells.length; i++) {
      const row = Math.floor(i / this.columns.length);
      const col = i % this.columns.length;

      const dataRow = visibleRows[row];

      if (!dataRow || col >= this.columns.length) {
        this.renderedCells[i].textContent = "";
      } else {
        const value = dataRow[col] ?? "";
        this.renderedCells[i].textContent = value;
      }
    }
  }

  /* -------------------------- Markup Helper Methods -------------------------- */

  private createTableCell(content: string, className: string): string {
    return `<div class="${className}" style="height:${
      this.config.cellHeight
    }px; min-width:${this.config.cellWidth}px">
              ${content ?? ""}
            </div>`;
  }

  private createHeaderCell(label: string): string {
    return `<div class="header-cell" style="height:${this.config.cellHeight}px; min-width:${this.config.cellWidth}px">
              ${label}
            </div>`;
  }

  private createSearchCell(placeholder: string, uniqueId: string): string {
    return `<input type="text" class="search-cell"
              placeholder="${placeholder}" id="${uniqueId}"
              style="height:${this.config.cellHeight}px; min-width:${this.config.cellWidth}px">`;
  }

  private generateScrollbar(): string {
    const thumbHeight = Math.max(
      20,
      this.config.cellHeight * (this.config.viewHeight / this.data.length)
    );

    return `
      <div id="table-scrollbar-track" class="scrollbar-track">
        <div id="table-scrollbar-thumb" class="scrollbar-thumb" style="height:${thumbHeight}px"></div>
      </div>
    `;
  }

  /* -------------------------- Search Functionality -------------------------- */

  private attachSearchInputListeners(): void {
    this.container.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        this.debouncedSearchHandler(target.id, target.value);
      });
    });
  }

  private debouncedSearchHandler = debounce(
    (columnId: string, value: string) => {
      this.executeSearch(columnId, value);
    },
    300
  );

  private executeSearch(columnIdxNumber: string, value: string): void {
    this.filteredData = this.data.filter((row) =>
      String(row[Number(columnIdxNumber)])
        .toLowerCase()
        .includes(value.toLowerCase())
    );
    this.updateVisibleCells();
  }

  private areSearchInputsEmpty(): boolean {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(".search-cell")
    ).every((input) => input.value === "");
  }

  /* ---------------------------- Scrollbar Handling ---------------------------- */

  private attachScrollbarEventListeners(): void {
    this.scrollbarThumb.addEventListener(
      "mousedown",
      this.onThumbMouseDown.bind(this)
    );
    document.addEventListener("mouseup", this.onMouseUp.bind(this));
    document.addEventListener("mousemove", this.onMouseMove.bind(this));
  }

  private onThumbMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.isThumbDragging = true;
    this.container.style.userSelect = "none";
    this.dragStartY =
      event.clientY - this.scrollbarThumb.getBoundingClientRect().top;
  }

  private onMouseUp(): void {
    if (this.isThumbDragging) {
      this.isThumbDragging = false;
      this.container.style.userSelect = "auto";
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.isThumbDragging) {
      this.debouncedThumbPositionUpdate(event);
    }
  }

  private debouncedThumbPositionUpdate = debounce((event: MouseEvent) => {
    this.updateThumbPosition(event);
  }, 5);

  private updateThumbPosition(event: MouseEvent): void {
    const trackTop = this.scrollbarTrack.getBoundingClientRect().top;
    const maxTop =
      this.scrollbarTrack.clientHeight - this.scrollbarThumb.clientHeight;

    let newThumbTop = event.clientY - trackTop - this.dragStartY;
    newThumbTop = Math.max(0, Math.min(newThumbTop, maxTop));

    this.scrollbarThumb.style.top = `${newThumbTop}px`;

    // Map thumb position to row index
    const scrollValue = Math.floor((newThumbTop / maxTop) * this.data.length);

    if (scrollValue >= this.data.length - this.viewWindow.visibleCount) {
      this.viewWindow.start = this.data.length - this.viewWindow.visibleCount;
      this.viewWindow.end = this.data.length - 1;
    } else {
      this.viewWindow.start = scrollValue;
      this.viewWindow.end = scrollValue + this.viewWindow.visibleCount;
    }

    this.updateVisibleCells();
  }

  /* ---------------------------- Auto scroll ---------------------------- */
  /** Starts a continuous, smooth scrolling simulation. */
  public startAutoScroll(): void {
    if (this.autoScrollId !== null) return; // Already running

    this.lastScrollTime = performance.now();

    const scrollLoop = (time: DOMHighResTimeStamp) => {
      if (time - this.lastScrollTime > this.scrollDelay) {
        this.handleScroll(1);
        this.lastScrollTime = time;
      }

      const maxScrollableIndex = Math.max(
        0,
        this.data.length - this.viewWindow.visibleCount
      );
      if (this.viewWindow.start < maxScrollableIndex) {
        this.autoScrollId = requestAnimationFrame(scrollLoop);
      } else {
        this.stopAutoScroll();
      }
    };

    this.autoScrollId = requestAnimationFrame(scrollLoop);
  }

  /** Stops the continuous scrolling simulation. */
  public stopAutoScroll(): void {
    if (this.autoScrollId !== null) {
      cancelAnimationFrame(this.autoScrollId);
      this.autoScrollId = null;
    }
  }

  /* ------------------------------- Public API ------------------------------- */

  render(): void {
    this.generateAndRenderMarkup();
    this.attachSearchInputListeners();

    this.scrollbarTrack = document.querySelector("#table-scrollbar-track")!;
    this.scrollbarThumb = document.querySelector("#table-scrollbar-thumb")!;

    this.attachScrollbarEventListeners();
  }

  loadData(data: RowData[]): void {
    this.data = data;
    this.filteredData = data;
  }
  destroy() {
    document.querySelector("#table")?.remove();
  }
}

/**-------------------------End of the file------------------------- */
