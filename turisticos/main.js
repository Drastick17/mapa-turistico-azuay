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
      width: 8,
    }),
    fill: new Fill({
      color: "rgba(0, 0, 255, 0.2)",
    }),
  }),
  "ne:Ruta Completa Cuenca Norte": new Style({
    stroke: new Stroke({
      color: "#06f",
      width: 8,
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
    };
  });

  const features = layers
    .filter((layer) => layer)
    .map((layerInfo) => {
      const [lowerX, lowerY] = layerInfo.lowerCorner.split(" ");
      const [upperX, upperY] = layerInfo.upperCorner.split(" ");
      return {
        render: true,
        name: layerInfo.name,
        title: layerInfo.title,
        url: `${baseUrl}/ne/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${layerInfo.name}&outputFormat=application/json&srsname=EPSG:4326&bbox=${lowerX},${lowerY},${upperX},${upperY},EPSG:4326`,
      };
    });
  return features;
}

async function initMap() {
  const layers = await getCapabilities();
  const layersContainer = setDOMLayers(layers);
  layersContainer.addEventListener("click", (e) => {
    if (e.target.tagName == "INPUT") {
      layers.forEach((layer) => {
        if (layer.name === e.target.value && layer.render) {
          layer.render = false;
        }else{
          layer.render = true;
        }
      });
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

  layers.forEach((layerInfo) => {
    if (!layerInfo.render) return;
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
  });

  const selectedStyle = new Style({
    fill: new Fill({
      color: "rgba(255, 255, 255, 0.6)",
    }),
    stroke: new Stroke({
      color: "rgba(255, 255, 255, 0.7)",
      width: 2,
    }),
  });

  // a normal select interaction to handle click
  const select = new Select({
    style: function () {
      const color = "rgba(0, 255, 0, 0.4)";
      selectedStyle.getFill().setColor(color);
      return selectedStyle;
    },
  });

  map.addInteraction(select);

  const selectedFeatures = select.getFeatures();

  const dragBox = new DragBox({
    condition: platformModifierKeyOnly,
  });

  map.addInteraction(dragBox);

  dragBox.on("boxend", function () {
    const boxExtent = dragBox.getGeometry().getExtent();

    const worldExtent = map.getView().getProjection().getExtent();
    const worldWidth = getWidth(worldExtent);
    const startWorld = Math.floor((boxExtent[0] - worldExtent[0]) / worldWidth);
    const endWorld = Math.floor((boxExtent[2] - worldExtent[0]) / worldWidth);

    for (let world = startWorld; world <= endWorld; ++world) {
      const left = Math.max(boxExtent[0] - world * worldWidth, worldExtent[0]);
      const right = Math.min(boxExtent[2] - world * worldWidth, worldExtent[2]);
      const extent = [left, boxExtent[1], right, boxExtent[3]];

      const boxFeatures = vectorSource
        .getFeaturesInExtent(extent)
        .filter(
          (feature) =>
            !selectedFeatures.getArray().includes(feature) &&
            feature.getGeometry().intersectsExtent(extent)
        );

      // features that intersect the box geometry are added to the
      // collection of selected features
      const rotation = map.getView().getRotation();
      const oblique = rotation % (Math.PI / 2) !== 0;

      // when the view is obliquely rotated the box extent will
      if (oblique) {
        const anchor = [0, 0];
        const geometry = dragBox.getGeometry().clone();
        geometry.translate(-world * worldWidth, 0);
        geometry.rotate(-rotation, anchor);
        const extent = geometry.getExtent();
        boxFeatures.forEach(function (feature) {
          const geometry = feature.getGeometry().clone();
          geometry.rotate(-rotation, anchor);
          if (geometry.intersectsExtent(extent)) {
            selectedFeatures.push(feature);
          }
        });
      } else {
        selectedFeatures.extend(boxFeatures);
      }
    }
  });

  dragBox.on("boxstart", function () {
    selectedFeatures.clear();
  });

  const infoBox = document.getElementById("info");

  selectedFeatures.on(["add", "remove"], function () {
    const names = selectedFeatures.getArray().map((feature) => {
      return `${feature.get("NOM_CANTON")}-${feature.get("PARROQUIA")}`;
    });
    if (names.length > 0) {
      infoBox.classList.add("show");
      infoBox.innerHTML = names.join(", ");
    } else {
      infoBox.classList.remove("show");
      infoBox.innerHTML = "None";
    }
  });
}

initMap();
