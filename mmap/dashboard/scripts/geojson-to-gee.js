function normalizeGeometry(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Input must be a valid GeoJSON object.");
  }

  if (input.type === "Feature") {
    if (!input.geometry) {
      throw new Error("Feature is missing a geometry.");
    }
    return input.geometry;
  }

  if (input.type === "FeatureCollection") {
    if (!Array.isArray(input.features) || input.features.length === 0) {
      throw new Error("FeatureCollection has no features.");
    }

    const geometries = input.features
      .map((feature) => feature && feature.geometry)
      .filter(Boolean);

    if (geometries.length === 0) {
      throw new Error("FeatureCollection has no valid geometries.");
    }

    if (geometries.length === 1) {
      return geometries[0];
    }

    return {
      type: "GeometryCollection",
      geometries,
    };
  }

  if (typeof input.type === "string" && input.coordinates) {
    return input;
  }

  throw new Error("Unsupported GeoJSON type. Use Geometry, Feature, or FeatureCollection.");
}

export function convertGeoJsonToEeGeometry(inputText) {
  if (!inputText || !inputText.trim()) {
    throw new Error("Input is empty. Paste GeoJSON first.");
  }

  let parsed;
  try {
    parsed = JSON.parse(inputText);
  } catch {
    throw new Error("Input is not valid JSON.");
  }

  const geometry = normalizeGeometry(parsed);
  const geometryJson = JSON.stringify(geometry, null, 2);

  return `var geom = ee.Geometry(${geometryJson});`;
}
