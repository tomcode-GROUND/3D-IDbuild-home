import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { loadLocalGlb } from "./localGlb";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { strFromU8 } from "fflate";
import { material } from "./materials";
import type { Furniture, Opening, HomeModel } from "./types";
const cache = new WeakMap<Uint8Array, Promise<T.Group>>();
function readObj(
  path: string,
  bytes: Uint8Array,
  home: HomeModel,
): Promise<T.Group> {
  const source = strFromU8(bytes),
    base = path.slice(0, path.lastIndexOf("/") + 1),
    mtl = source.match(/^mtllib\s+(.+)$/m)?.[1]?.trim(),
    mtlPath = mtl ? base + mtl : "";
  if (!mtlPath || !home.assets[mtlPath])
    return Promise.resolve(new OBJLoader().parse(source));
  return new Promise((resolve, reject) => {
    const manager = new T.LoadingManager(),
      urls: string[] = [];
    let loading = false,
      obj: T.Group,
      missing = false;
    manager.onStart = () => {
      loading = true;
    };
    manager.onLoad = () => {
      urls.forEach(URL.revokeObjectURL);
      if (missing)
        obj.userData.assetWarning = "Embedded material texture missing";
      resolve(obj);
    };
    manager.setURLModifier((url) => {
      const data = home.assets[decodeURI(url)];
      if (!data) {
        missing = true;
        return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      }
      const local = URL.createObjectURL(
        new Blob([Uint8Array.from(data).buffer]),
      );
      urls.push(local);
      return local;
    });
    try {
      const materials = new MTLLoader(manager).parse(
        strFromU8(home.assets[mtlPath]),
        mtlPath.slice(0, mtlPath.lastIndexOf("/") + 1),
      );
      materials.preload();
      obj = new OBJLoader(manager).setMaterials(materials).parse(source);
      obj.userData.embeddedMaterials = true;
      if (!loading) resolve(obj);
    } catch (e) {
      urls.forEach(URL.revokeObjectURL);
      reject(e);
    }
  });
}
export function fitModel(obj: T.Object3D, w: number, h: number, d: number) {
  const box = new T.Box3().setFromObject(obj),
    size = box.getSize(new T.Vector3());
  const inner = new T.Group();
  inner.add(obj);
  obj.position.sub(
    new T.Vector3(
      (box.min.x + box.max.x) / 2,
      box.min.y,
      (box.min.z + box.max.z) / 2,
    ),
  );
  const wrapper = new T.Group();
  wrapper.add(inner);
  wrapper.scale.set(w / (size.x || 1), h / (size.y || 1), d / (size.z || 1));
  return wrapper;
}
export async function buildObject(f: Furniture | Opening, home: HomeModel) {
  const g = new T.Group();
  g.name = f.name;
  g.userData.selection = { kind: f.kind, id: f.id };
  g.position.set(f.x / 100, f.elevation / 100, f.y / 100);
  g.rotation.y = -f.angle;
  if (f.modelMirrored) g.scale.x = -1;
  g.visible = !f.hidden;
  const w = f.width / 100,
    d = f.depth / 100,
    h = f.height / 100;
  if (f.model && home.assets[f.model]) {
    try {
      const b = home.assets[f.model];
      let promise = cache.get(b);
      if (!promise) {
        promise = f.model.endsWith(".glb")
          ? loadLocalGlb(Uint8Array.from(b).buffer).then((v) => v.scene)
          : readObj(f.model, b, home);
        cache.set(b, promise);
      }
      const obj = (await promise).clone(true);
      obj.traverse((c) => {
        if (c instanceof T.Mesh) {
          c.castShadow = c.receiveShadow = true;
          const fix = (m: T.Material) => {
            if (obj.userData.embeddedMaterials && !f.color && !f.finish)
              return m.clone();
            if (f.kind === "furniture") {
              const n = (m as T.MeshStandardMaterial).clone();
              n.color = new T.Color(
                f.color ??
                  (m.name.includes("legs")
                    ? "#6a5038"
                    : f.finish === "walnut"
                      ? "#70523b"
                      : f.finish === "bronze"
                        ? "#b09060"
                        : f.finish === "greige"
                          ? "#aaa08d"
                          : "#e3d7bf"),
              );
              n.map = null;
              return n;
            }
            const name = m.name.toLowerCase();
            return /glass|transparent|pane/.test(name) ||
              (/window/i.test(f.model ?? "") && name === "flltgrey")
              ? new T.MeshPhysicalMaterial({
                  color: "#d3e2dd",
                  transparent: true,
                  opacity: 0.22,
                  roughness: 0.08,
                  metalness: 0.05,
                  depthWrite: false,
                })
              : material("greige", f.color);
          };
          c.material = Array.isArray(c.material)
            ? c.material.map(fix)
            : fix(c.material);
          if (
            (Array.isArray(c.material) ? c.material : [c.material]).some(
              (m) => m.transparent,
            )
          )
            c.castShadow = false;
        }
      });
      if (obj.userData.assetWarning)
        g.userData.assetWarning = obj.userData.assetWarning;
      g.add(fitModel(obj, w, h, d));
      if (f.kind === "furniture" && f.generator === "sofa") {
        const fabric = material("fabric", f.color);
        const base = new T.Mesh(
          new RoundedBoxGeometry(w * 0.98, 0.3, d * 0.97, 3, 0.07),
          fabric,
        );
        base.position.y = 0.2;
        base.castShadow = base.receiveShadow = true;
        g.add(base);
        for (const x of [-w * 0.46, w * 0.46]) {
          const arm = new T.Mesh(
            new RoundedBoxGeometry(w * 0.12, h * 0.55, d * 0.95, 3, 0.07),
            fabric,
          );
          arm.position.set(x, h * 0.42, 0);
          arm.castShadow = arm.receiveShadow = true;
          g.add(arm);
        }
      }
      return g;
    } catch {
      g.userData.assetWarning = "Asset could not be decoded";
    }
  }
  const finish = f.finish ?? "ivory";
  const mats = {
    main: material(finish, f.color),
    wood: material("walnut"),
    stone: material("stone"),
    metal: material("bronze"),
    fabric: material("fabric", f.color),
    ivory: material("ivory"),
  };
  function box(
    x: number,
    y: number,
    z: number,
    bw: number,
    bh: number,
    bd: number,
    m: T.Material = mats.main,
    r = 0.025,
  ) {
    const q = new T.Mesh(
      new RoundedBoxGeometry(
        Math.max(bw, 0.004),
        Math.max(bh, 0.004),
        Math.max(bd, 0.004),
        2,
        Math.min(r, bw / 3, bh / 3, bd / 3),
      ),
      m,
    );
    q.position.set(x, y, z);
    q.castShadow = q.receiveShadow = true;
    g.add(q);
    return q;
  }
  function cyl(
    x: number,
    y: number,
    z: number,
    r: number,
    ch: number,
    m: T.Material = mats.main,
    rt = r,
  ) {
    const q = new T.Mesh(new T.CylinderGeometry(rt, r, ch, 48), m);
    q.position.set(x, y, z);
    q.castShadow = q.receiveShadow = true;
    g.add(q);
    return q;
  }
  function legs(top: number) {
    for (const x of [-w * 0.4, w * 0.4])
      for (const z of [-d * 0.38, d * 0.38])
        box(x, top / 2, z, 0.035, top, 0.035, mats.metal);
  }
  const kind = f.kind === "furniture" ? f.generator : undefined;
  switch (kind) {
    case "media":
      box(0, 0.28, 0, w, 0.55, d, mats.wood);
      box(0, h / 2, -d * 0.35, w, h, 0.06, mats.wood);
      for (let i = 0; i < 5; i++)
        box(
          -w * 0.4 + i * w * 0.2,
          0.28,
          d / 2 + 0.01,
          w * 0.19,
          0.5,
          0.025,
          mats.main,
        );
      box(
        0,
        1.45,
        d * 0.05,
        w * 0.72,
        1.05,
        0.055,
        new T.MeshStandardMaterial({
          color: "#161b1c",
          metalness: 0.25,
          roughness: 0.2,
        }),
      );
      box(
        0,
        1.45,
        d * 0.05 + 0.032,
        w * 0.69,
        0.98,
        0.008,
        new T.MeshStandardMaterial({
          color: "#637b83",
          emissive: "#56676a",
          emissiveIntensity: 0.15,
          roughness: 0.18,
        }),
      );
      box(0, 0.59, 0, w, 0.035, d + 0.02, mats.stone);
      break;

    case "bed":
      box(0, 0.12, 0, w, 0.22, d, mats.wood, 0.04);
      box(0, 0.34, 0, w, 0.25, d * 0.96, mats.fabric, 0.09);
      box(0, h / 2, -d / 2 + 0.04, w + 0.05, h, 0.1, mats.fabric, 0.05);
      box(0, 0.5, d * 0.12, w + 0.03, 0.07, d * 0.67, mats.fabric, 0.04);
      for (const x of [-w * 0.24, w * 0.24])
        box(x, 0.53, -d * 0.3, w * 0.43, 0.17, 0.43, mats.ivory, 0.07);
      box(0, 0.56, d * 0.34, w + 0.04, 0.04, 0.45, material("greige"), 0.02);
      break;
    case "sofa":
      box(0, 0.3, 0, w, 0.45, d, mats.fabric, 0.1);
      box(0, h * 0.7, -d * 0.42, w, h * 0.5, 0.2, mats.fabric, 0.08);
      for (const x of [-w * 0.45, w * 0.45])
        box(x, h * 0.45, 0, w * 0.1, h * 0.8, d, mats.fabric, 0.07);
      for (let i = 0; i < 3; i++)
        box(
          (i - 1) * w * 0.27,
          0.55,
          0.02,
          w * 0.26,
          0.18,
          d * 0.75,
          mats.fabric,
          0.07,
        );
      break;
    case "chair":
      legs(0.44);
      box(0, 0.47, 0, w, 0.13, d, mats.fabric, 0.07);
      box(0, 0.68, -d * 0.4, w, 0.35, 0.12, mats.fabric, 0.05);
      break;
    case "table":
    case "coffee":
      cyl(0, h - 0.035, 0, w / 2, 0.07, mats.stone);
      cyl(0, (h - 0.07) / 2, 0, w * 0.22, h - 0.07, mats.metal);
      break;
    case "rug":
      box(0, 0.005, 0, w, 0.01, d, mats.fabric, 0.004);
      break;
    case "curtain":
      for (let i = 0; i < Math.ceil(w / 0.07); i++) {
        const x = -w / 2 + i * 0.07;
        if (w > 1.6 && Math.abs(x) < w * 0.22) continue;
        box(
          x,
          h / 2,
          Math.sin(i * 1.1) * 0.035,
          0.085,
          h,
          0.06,
          mats.fabric,
          0.025,
        );
      }
      break;
    case "pendant": {
      const ring = new T.Mesh(
        new T.TorusGeometry(w / 2, 0.015, 10, 64),
        mats.metal,
      );
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const glow = new T.Mesh(
        new T.TorusGeometry(w / 2 - 0.015, 0.009, 8, 64),
        new T.MeshStandardMaterial({
          color: "#fff1c0",
          emissive: "#ffcd79",
          emissiveIntensity: 3,
        }),
      );
      glow.rotation.x = Math.PI / 2;
      g.add(glow);
      for (const x of [-w * 0.35, w * 0.35])
        box(x, 0.32, 0, 0.004, 0.65, 0.004, mats.metal);
      break;
    }
    case "lamp":
      cyl(0, 0.025, 0, w / 2, 0.05, mats.metal);
      cyl(0, h * 0.43, 0, 0.018, h * 0.8, mats.metal);
      cyl(
        0,
        h * 0.85,
        0,
        w / 2,
        h * 0.25,
        new T.MeshStandardMaterial({
          color: "#ead8b7",
          emissive: "#c9974f",
          emissiveIntensity: 0.35,
        }),
        w * 0.42,
      );
      break;
    case "plant":
      cyl(0, h * 0.12, 0, w * 0.35, h * 0.24, mats.stone, w * 0.45);
      cyl(0, h * 0.48, 0, 0.018, h * 0.7, mats.wood);
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4,
          y = h * (0.4 + (i % 5) * 0.11);
        const q = new T.Mesh(
          new T.SphereGeometry(0.1, 8, 6),
          new T.MeshStandardMaterial({
            color: i % 2 ? "#727a45" : "#485d36",
            roughness: 0.95,
          }),
        );
        q.scale.set(1.8, 0.45, 0.6);
        q.position.set(Math.sin(a) * w * 0.45, y, Math.cos(a) * w * 0.45);
        q.rotation.z = a;
        g.add(q);
      }
      break;
    case "desk":
      legs(h - 0.05);
      box(0, h - 0.025, 0, w, 0.05, d, mats.wood);
      box(
        0,
        h + 0.22,
        -d * 0.34,
        0.5,
        0.32,
        0.03,
        new T.MeshStandardMaterial({ color: "#1f292b", roughness: 0.3 }),
      );
      box(0, h + 0.045, -d * 0.3, 0.025, 0.1, 0.03, mats.metal);
      break;
    case "shower": {
      box(0, 0.025, 0, w, 0.05, d, mats.stone);
      const glass = new T.MeshPhysicalMaterial({
        color: "#c4ded8",
        transparent: true,
        opacity: 0.18,
        roughness: 0.07,
        side: T.DoubleSide,
        depthWrite: false,
      });
      box(-w / 2, h / 2, 0, 0.012, h, d, glass);
      box(0, h / 2, d / 2, w, h, 0.012, glass);
      box(w * 0.3, h * 0.8, -d * 0.4, 0.02, h * 0.3, 0.02, mats.metal);
      break;
    }
    case "toilet":
      cyl(0, 0.27, 0, w * 0.42, 0.48, mats.ivory);
      box(0, 0.5, 0, w, 0.08, d * 0.65, mats.ivory, 0.06);
      box(0, 0.55, -d * 0.32, w, 0.4, 0.2, mats.ivory, 0.04);
      break;
    case "bath":
      box(0, h / 2, 0, w, h, d, mats.ivory, 0.1);
      box(0, h + 0.004, 0, w * 0.78, 0.012, d * 0.83, mats.stone, 0.08);
      break;
    case "basin":
      box(0, h * 0.4, 0, w, h * 0.8, d, mats.wood);
      box(0, h - 0.035, 0, w, 0.07, d, mats.stone);
      cyl(0, h + 0.04, 0, w * 0.25, 0.09, mats.ivory);
      box(0, h + 0.14, -d * 0.34, 0.02, 0.28, 0.025, mats.metal);
      break;
    case "fridge":
      box(0, h / 2, 0, w, h, d, mats.main);
      box(w * 0.35, h * 0.58, d / 2 + 0.015, 0.02, h * 0.32, 0.025, mats.metal);
      box(0, h * 0.35, d / 2 + 0.005, w, 0.008, 0.012, mats.metal);
      break;
    case "shelf":
      box(0, h / 2, -d / 2 + 0.02, w, h, 0.04, mats.wood);
      for (let i = 0; i < 5; i++) {
        box(0, (h * i) / 4, 0, w, 0.04, d, mats.wood);
        if (i < 4)
          for (let j = 0; j < 4; j++)
            box(
              -w * 0.35 + j * w * 0.2,
              (h * i) / 4 + 0.14,
              -d * 0.1,
              0.035,
              0.25,
              0.13,
              j % 2 ? mats.main : mats.stone,
            );
      }
      break;
    case "counter":
    case "cabinet":
    default: {
      box(0, h / 2, 0, w, h, d, mats.main);
      const n = Math.max(1, Math.round(w / 0.5));
      for (let i = 0; i < n; i++) {
        box(
          -w / 2 + ((i + 0.5) * w) / n,
          h / 2,
          d / 2 + 0.006,
          w / n - 0.012,
          h - 0.03,
          0.018,
          mats.main,
          0.004,
        );
        box(
          -w / 2 + ((i + 0.5) * w) / n,
          h * 0.78,
          d / 2 + 0.023,
          (w / n) * 0.45,
          0.008,
          0.012,
          mats.metal,
          0.002,
        );
      }
      if (kind === "counter") {
        box(0, h + 0.015, 0, w + 0.025, 0.03, d + 0.025, mats.stone);
        if (/sink/i.test(f.name)) {
          const steel = new T.MeshStandardMaterial({
            color: "#999c96",
            metalness: 0.75,
            roughness: 0.28,
          });
          box(
            -w * 0.16,
            h + 0.035,
            0,
            Math.min(0.48, w * 0.6),
            0.018,
            Math.min(0.34, d * 0.72),
            steel,
            0.008,
          );
          box(
            -w * 0.16,
            h + 0.045,
            0,
            Math.min(0.41, w * 0.52),
            0.006,
            Math.min(0.27, d * 0.59),
            new T.MeshStandardMaterial({
              color: "#454942",
              metalness: 0.62,
              roughness: 0.32,
            }),
            0.002,
          );
          cyl(-w * 0.16, h + 0.13, -d * 0.37, 0.012, 0.19, mats.metal);
          box(
            -w * 0.16,
            h + 0.22,
            -d * 0.24,
            0.025,
            0.025,
            0.18,
            mats.metal,
            0.008,
          );
        } else
          for (const x of [-0.15, 0.15])
            cyl(
              x,
              h + 0.035,
              0,
              0.09,
              0.008,
              new T.MeshStandardMaterial({
                color: "#292a27",
                metalness: 0.5,
                roughness: 0.3,
              }),
            );
      }
      break;
    }
  }
  return g;
}
