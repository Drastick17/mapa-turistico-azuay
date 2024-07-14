export default function setDOMLayers(layers) {
  const shadowContainer = document.querySelector("#selector");
  const container = shadowContainer.content.cloneNode(true);
  const list = container.children[0];
  layers.map((layer) => {
    if(["Azuay", "Rutas — cortado", "Cuenca Canton"].includes(layer.title)) return ""
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    checkbox.setAttribute("value", layer.name);
    label.classList.add("layers-option");
    checkbox.checked = layer.render;
    label.innerHTML =`<span>${layer.title}</span>`;
    label.appendChild(checkbox);
    list.appendChild(label);
  });
  document.body.appendChild(container);
  return list;
}
