import "./style.css";
import { Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { FullScreen, defaults as defaultControls } from "ol/control.js";
import { Style, Stroke, Fill } from "ol/style";
import {
  DragRotateAndZoom,
  defaults as defaultInteractions,
} from "ol/interaction.js";
import { fromLonLat } from "ol/proj";
import { WFS, GeoJSON } from "ol/format";
import { bbox as bboxStrategy } from "ol/loadingstrategy";

const baseUrl = "http://192.168.0.106:8080/geoserver";

//GetCapabilities XML
const getCapabilitiesUrl = `${baseUrl}/ne/wfs?request=GetCapabilities`; // Adjust this path accordingly

const styles = {
  "ne:Azuay": new Style({
    stroke: new Stroke({
      color: "blue",
      width: 8,
    }),
    fill: new Fill({
      color: "rgba(0, 0, 255, 0.1)",
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
      return `${baseUrl}/ne/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${layerInfo.name}&outputFormat=application/json&srsname=EPSG:4326&bbox=${lowerX},${lowerY},${upperX},${upperY},EPSG:4326`;
    });
  return features;
}

async function initMap() {
  const layers = await getCapabilities();

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
      center: fromLonLat([-79.0059, -2.9006]), // Coordinates of Cuenca, Azuay in EPSG:4326
      zoom: 8,
    }),
  });

  layers.forEach((layerInfo) => {
    const vectorSource = new VectorSource({
      format: new GeoJSON(),
      url: layerInfo,
      strategy: bboxStrategy,
    });
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      title: layerInfo.title,
      style: styles[layerInfo.name],
    });

    map.addLayer(vectorLayer);
  });
}

initMap();
