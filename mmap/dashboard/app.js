import { convertGeoJsonToEeGeometry } from "./scripts/geojson-to-gee.js";

const geojsonInput = document.getElementById("geojsonInput");
const geeOutput = document.getElementById("geeOutput");
const convertBtn = document.getElementById("convertBtn");

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
