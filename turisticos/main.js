import { Map, View } from "ol";
import { FullScreen, defaults as defaultControls } from "ol/control.js";
import { platformModifierKeyOnly } from "ol/events/condition.js";
import { getWidth } from "ol/extent.js";
import { GeoJSON } from "ol/format";
import {
  DragBox,
  DragRotateAndZoom,
  Select,
  defaults as defaultInteractions,
} from "ol/interaction.js";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { bbox as bboxStrategy } from "ol/loadingstrategy";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style } from "ol/style";
import setDOMLayers from "./selector";
import "./style.css";

const baseUrl = "http://localhost:8080/geoserver";

//GetCapabilities XML
const getCapabilitiesUrl = `${baseUrl}/ne/wfs?request=GetCapabilities`; // Adjust this path accordingly

const styles = {
  "ne:Azuay": new Style({
    stroke: new Stroke({
      color: "#080",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(0, 255, 0, 0.1)",
    }),
  }),
  "ne:Cuenca Canton": new Style({
    stroke: new Stroke({
      color: "#080",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(0, 255, 0, 0.2)",
    }),
  }),
  "ne:Ruta Completa Cuenca Sur": new Style({
    stroke: new Stroke({
      color: "#06f",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(0, 0, 255, 0.2)",
    }),
  }),
  "ne:Ruta Completa Cuenca Norte": new Style({
    stroke: new Stroke({
      color: "#06f",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(0, 0, 255, 0.2)",
    }),
  }),
  "ne:Ruta busa": new Style({
    stroke: new Stroke({
      color: "#06f",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(0, 0, 255, 0.2)",
    }),
  }),
  "ne:Ruta Cajas": new Style({
    stroke: new Stroke({
      color: "#06f",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(0, 0, 255, 0.2)",
    }),
  }),
  'ne:Recorrido Busa': new Style({
    stroke: new Stroke({
      color: "#06f",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(0, 0, 255, 0.2)",
    }),
  }),
};

async function getCapabilities() {
  const response = await fetch(getCapabilitiesUrl);
  const text = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "application/xml");
  const layers = [...xmlDoc.getElementsByTagName("FeatureType")].map((node) => {
    if (
      [
        "Boundary Lines",
        "Coastlines",
        "Countries",
        "Disputed Areas",
        "Populated Places",
      ].includes(node.getElementsByTagName("Title")[0].textContent)
    )
      return null;

    return {
      name: node.getElementsByTagName("Name")[0].textContent,
      title: node.getElementsByTagName("Title")[0].textContent,
      lowerCorner: node.getElementsByTagName("ows:LowerCorner")[0].textContent,
      upperCorner: node.getElementsByTagName("ows:UpperCorner")[0].textContent,
      render: true, // Add render property to control layer visibility
    };
  });

  const features = layers
    .filter((layer) => layer)
    .map((layerInfo) => {
      const [lowerX, lowerY] = layerInfo.lowerCorner.split(" ");
      const [upperX, upperY] = layerInfo.upperCorner.split(" ");
      return {
        ...layerInfo, // Include existing properties
        url: `${baseUrl}/ne/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${layerInfo.name}&outputFormat=application/json&srsname=EPSG:4326&bbox=${lowerX},${lowerY},${upperX},${upperY},EPSG:4326`,
      };
    });
  return features;
}

async function initMap() {
  const layers = await getCapabilities();
  const layersContainer = setDOMLayers(layers);
  layersContainer.addEventListener("click", (e) => {
    if (e.target.tagName === "INPUT") {
      const layerName = e.target.value;
      layers.forEach((layer) => {
        if (layer.name === layerName) {
          layer.render = e.target.checked;
        }
      });

      renderLayers();
    }
  });

  const map = new Map({
    target: "map",
    controls: defaultControls().extend([new FullScreen()]),
    interactions: defaultInteractions().extend([new DragRotateAndZoom()]),
    layers: [
      new TileLayer({
        source: new OSM(),
      }),
    ],
    view: new View({
      center: fromLonLat([-79.0059, -2.9006]),
      zoom: 8,
    }),
  });

  const vectorLayers = [];

  const renderLayers = () => {
    // Clear vector layers from the map
    vectorLayers.forEach((layer) => {
      map.removeLayer(layer);
    });
    vectorLayers.length = 0;

    layers.forEach((layerInfo, index) => {
      if (layerInfo.render) {
        const vectorSource = new VectorSource({
          format: new GeoJSON(),
          url: layerInfo.url,
          strategy: bboxStrategy,
        });
        const vectorLayer = new VectorLayer({
          source: vectorSource,
          title: layerInfo.title,
          style: styles[layerInfo.name],
        });
        map.addLayer(vectorLayer);
        vectorLayers.push(vectorLayer);
      }
    });
  };

  renderLayers();

  // Select interaction for feature selection
  const select = new Select();
  map.addInteraction(select);

  const dragBox = new DragBox({
    condition: platformModifierKeyOnly,
  });
  map.addInteraction(dragBox);

  dragBox.on("boxend", function () {
    const boxExtent = dragBox.getGeometry().getExtent();

    const selectedFeatures = select.getFeatures();
    selectedFeatures.clear(); // Clear previously selected features

    vectorLayers.forEach((vectorLayer) => {
      const source = vectorLayer.getSource();
      source.forEachFeatureIntersectingExtent(boxExtent, (feature) => {
        selectedFeatures.push(feature);
      });
    });

    updateInfoBox(selectedFeatures);
  });

  dragBox.on("boxstart", function () {
    select.getFeatures().clear();
    clearInfoBox();
  });

  const infoBox = document.getElementById("info");

  function updateInfoBox(selectedFeatures) {
    const names = selectedFeatures.getArray().map((feature) => {
      return feature.get("NOM_CANTON")
        ? `${feature.get("NOM_CANTON")}${feature.get("PARROQUIA")}`
        :feature.get("Name")
    });

    if (names.length > 0) {
      infoBox.classList.add("show");
      infoBox.innerHTML = names.join(", ");
    } else {
      infoBox.classList.remove("show");
      infoBox.innerHTML = "None";
    }
  }

  function clearInfoBox() {
    infoBox.classList.remove("show");
    infoBox.innerHTML = "None";
  }

  select.on(["select"], function () {
    const selectedFeatures = select.getFeatures();
    updateInfoBox(selectedFeatures);
  });
}

initMap();
