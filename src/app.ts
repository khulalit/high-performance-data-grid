import Papa from "papaparse";
import { GridConfig, GridTable } from "./grid-table";
import { calculateHeight } from "./utils";
export const App = () => {
  let gridTable: any = null;
  const GRID_CONTAINER = document.querySelector("#grid") as HTMLElement;
  const FILE_INPUT = document.querySelector("#file-input") as HTMLInputElement;
  const APP_FILE = document.querySelector("#app-upload") as HTMLElement;
  const APP_GRID = document.querySelector("#app-grid") as HTMLElement;
  const LOADER = document.querySelector("#loading-container") as HTMLElement;
  const FILE_NAME = document.querySelector("#status-file-name") as HTMLElement;
  const CLOSE_BTN = document.querySelector("#status-close-grid");
  const SCROLL_AUTO_BTN = document.querySelector("#status-auto-scroll");

  CLOSE_BTN?.addEventListener("click", () => {
    if (gridTable) {
      gridTable.destroy();
      gridTable = null;
    }

    FILE_INPUT.value = "";
    // Clear status and switch views
    if (FILE_NAME) FILE_NAME.textContent = "No file selected";
    if (APP_FILE) APP_FILE.style.display = "flex";
    if (APP_GRID) APP_GRID.style.display = "none";
  });

  let startScrolling = false;
  SCROLL_AUTO_BTN?.addEventListener("click", () => {
    if (!gridTable) return;
    startScrolling = !startScrolling;
    if (startScrolling) {
      gridTable.startAutoScroll();
      SCROLL_AUTO_BTN.textContent = "Stop auto scroll";
    } else {
      gridTable.stopAutoScroll();
      SCROLL_AUTO_BTN.textContent = "Start auto scroll";
    }
  });

  FILE_INPUT?.addEventListener("change", (e: any) => {
    const file = e?.target?.files[0];
    const MAX_SIZE_MB = 50;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

    if (file && file.size >= MAX_SIZE_BYTES) {
      alert(
        `File size exceeds the maximum limit of ${MAX_SIZE_MB} MB. Please select a smaller file.`
      );
      e.target.value = null;
      return;
    }
    FILE_NAME.textContent = file.name;
    LOADER.style.display = "flex";
    Papa.parse(file, {
      header: false,
      dynamicTyping: true,
      worker: true,
      error() {
        alert("Error while parsing the file.");
      },

      complete: function (results: any) {
        const colsDefination = results.data[0].map((key: any) => ({
          identifier: key,
          label: key,
        }));

        const config: GridConfig = {
          cellHeight: 22,
          viewHeight: calculateHeight(24),
          cellWidth: 100,
        };
        gridTable = new GridTable(GRID_CONTAINER, colsDefination, config);
        gridTable.loadData(results?.data.slice(1));
        APP_FILE.style.display = "none";
        APP_GRID.style.display = "block";

        gridTable.render();
        LOADER.style.display = "none";

        if (startScrolling) gridTable.startAutoScroll();
      },
    });
  });
};
