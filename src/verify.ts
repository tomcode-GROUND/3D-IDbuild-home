import * as T from "three";
import { loadLocalGlb } from "./lib/localGlb";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const scene = new T.Scene();
scene.background = new T.Color("#d5cdbf");
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = T.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const camera = new T.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 200),
  controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const env = new T.PMREMGenerator(renderer).fromScene(new RoomEnvironment());
scene.environment = env.texture;
scene.add(new T.HemisphereLight("#fff4da", "#77634b", 1));
let model: T.Object3D | undefined;
async function load(bytes: ArrayBuffer) {
  try {
    const g = await loadLocalGlb(bytes);
    if (model) scene.remove(model);
    model = g.scene;
    scene.add(model);
    const b = new T.Box3().setFromObject(model),
      c = b.getCenter(new T.Vector3());
    camera.position.set(c.x + 14, 14, c.z + 14);
    controls.target.copy(c);
    let meshes = 0;
    model.traverse((o) => {
      if (o instanceof T.Mesh) meshes++;
    });
    document.querySelector("#status")!.textContent =
      `GLB loaded · ${meshes} meshes · geometry and PBR materials decoded.`;
  } catch (e) {
    document.querySelector("#status")!.textContent = String(e);
  }
}
document.querySelector<HTMLInputElement>("#file")!.onchange = (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (f.size > 50_000_000) {
    document.querySelector("#status")!.textContent =
      "Choose a GLB below 50 MB.";
    return;
  }
  void f
    .arrayBuffer()
    .then(load)
    .catch(() => {
      document.querySelector("#status")!.textContent =
        "Could not read this file.";
    });
};
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
