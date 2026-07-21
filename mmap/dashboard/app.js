import { convertGeoJsonToEeGeometry } from "./scripts/geojson-to-gee.js";

const geojsonInput = document.getElementById("geojsonInput");
const geeOutput = document.getElementById("geeOutput");
const convertBtn = document.getElementById("convertBtn");
const toolSelect = document.getElementById("toolSelect");
const toolPanels = Array.from(document.querySelectorAll("[data-tool-panel]"));

function showTool(toolName) {
  for (const panel of toolPanels) {
    const isActive = panel.dataset.toolPanel === toolName;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  }
}

function convertInput() {
  if (!geojsonInput || !geeOutput) return;

  try {
    const output = convertGeoJsonToEeGeometry(geojsonInput.value);
    geeOutput.value = output;
  } catch (err) {
    geeOutput.value = `Error: ${err.message}`;
  }
}

if (convertBtn) {
  convertBtn.addEventListener("click", convertInput);
}

if (geojsonInput) {
  geojsonInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      convertInput();
    }
  });
}

if (toolSelect) {
  showTool(toolSelect.value);
  toolSelect.addEventListener("change", () => {
    showTool(toolSelect.value);
  });
}
