import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { fitOverview } from "../lib/cameraFit";
import { prepareGlbExport } from "../lib/glbExport";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildArchitecture, buildSurfaces } from "../lib/architecture";
import { buildObject } from "../lib/furniture";
import { openingsForWall } from "../lib/geometry";
import type { Furniture, HomeModel, Selection, Viewpoint } from "../lib/types";
export interface SceneViewerHandle {
  exportGlb: () => Promise<Blob>;
  capturePng: () => string | null;
  frameHome: () => void;
  currentView: () => Viewpoint | null;
  view: (v: Viewpoint) => void;
}
interface Props {
  home: HomeModel;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  walkMode: boolean;
  shellOnly: boolean;
  ceilings: boolean;
  transformMode: "translate" | "rotate";
  snap: number;
  onTransform: (id: string, patch: Partial<Furniture>) => void;
  onAssetWarning: (message: string) => void;
}
function dispose(obj: T.Object3D) {
  obj.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => m.dispose());
    }
  });
  obj.removeFromParent();
}
export const SceneViewer = forwardRef<SceneViewerHandle, Props>(
  function SceneViewer(props, ref) {
    const { home, ceilings, shellOnly } = props;
    const host = useRef<HTMLDivElement>(null),
      live = useRef(props);
    live.current = props;
    const runtime = useRef<{
      scene: T.Scene;
      camera: T.PerspectiveCamera;
      renderer: T.WebGLRenderer;
      orbit: OrbitControls;
      walk: PointerLockControls;
      transform: TransformControls;
      model: T.Group;
      composer: EffectComposer;
      ao: SSAOPass;
      objects: Map<string, { signature: string; object: T.Group }>;
      archSig: string;
      floorSig: string;
      selection: T.BoxHelper | null;
      fps: number;
    } | null>(null);
    const pending = useRef(new Set<Promise<unknown>>());
    const [ready, setReady] = useState(false),
      [metrics, setMetrics] = useState("Preparing scene…");
    function frameHome() {
      const r = runtime.current;
      if (!r) return;
      const pts = live.current.home.walls.flatMap((w) => [
        new T.Vector3(w.xStart / 100, 0, w.yStart / 100),
        new T.Vector3(w.xEnd / 100, w.height / 100, w.yEnd / 100),
      ]);
      r.orbit.target.copy(fitOverview(r.camera, new T.Box3().setFromPoints(pts)));
      r.orbit.update();
    }
    function view(v: Viewpoint) {
      const r = runtime.current;
      if (!r) return;
      r.camera.position.fromArray(v.position);
      r.orbit.target.fromArray(v.target);
      r.camera.lookAt(r.orbit.target);
      r.orbit.update();
    }
    useEffect(() => {
      if (!host.current) return;
      const el = host.current,
        scene = new T.Scene();
      scene.background = new T.Color("#d5cec0");
      const camera = new T.PerspectiveCamera(60, 1, 0.05, 100),
        renderer = new T.WebGLRenderer({
          antialias: true,
          preserveDrawingBuffer: true,
        });
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      el.appendChild(renderer.domElement);
      const orbit = new OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.maxPolarAngle = Math.PI * 0.49;
      orbit.minDistance = 0.3;
      orbit.maxDistance = 50;
      const walk = new PointerLockControls(camera, renderer.domElement),
        transform = new TransformControls(camera, renderer.domElement),
        helper = transform.getHelper();
      scene.add(helper);
      const model = new T.Group();
      model.name = "3D IDbuild home scene";
      scene.add(model);
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const ao = new SSAOPass(scene, camera, 512, 512);
      ao.kernelRadius = 0.1;
      ao.minDistance = 0.002;
      ao.maxDistance = 0.1;
      composer.addPass(ao);
      composer.addPass(new OutputPass());
      const pmrem = new T.PMREMGenerator(renderer),
        env = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = env.texture;
      runtime.current = {
        scene,
        camera,
        renderer,
        orbit,
        walk,
        transform,
        model,
        composer,
        ao,
        objects: new Map(),
        archSig: "",
        floorSig: "",
        selection: null,
        fps: 0,
      };
      const resize = () => {
        const w = el.clientWidth,
          h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        composer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();
      let downX = 0,
        downY = 0,
        dragged = false;
      const down = (e: PointerEvent) => {
        downX = e.clientX;
        downY = e.clientY;
        dragged = false;
      };
      const up = (e: PointerEvent) => {
        if (live.current.walkMode) {
          if (!walk.isLocked) walk.lock();
          return;
        }
        if (
          dragged ||
          transform.dragging ||
          Math.hypot(e.clientX - downX, e.clientY - downY) > 4
        )
          return;
        const rect = renderer.domElement.getBoundingClientRect(),
          ray = new T.Raycaster();
        ray.setFromCamera(
          new T.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            (-(e.clientY - rect.top) / rect.height) * 2 + 1,
          ),
          camera,
        );
        const hit = ray.intersectObject(model, true)[0];
        if (!hit) {
          live.current.onSelect(null);
          return;
        }
        let obj: T.Object3D | null = hit.object;
        while (obj && !obj.userData.selection && !obj.userData.architecture)
          obj = obj.parent;
        if (obj?.userData.architecture) {
          let best = Infinity,
            id = "";
          for (const w of live.current.home.walls) {
            const dx = w.xEnd - w.xStart,
              dy = w.yEnd - w.yStart,
              l2 = dx * dx + dy * dy;
            if (!l2) continue;
            const x = hit.point.x * 100,
              y = hit.point.z * 100,
              t = Math.max(
                0,
                Math.min(1, ((x - w.xStart) * dx + (y - w.yStart) * dy) / l2),
              );
            const d = Math.hypot(x - w.xStart - t * dx, y - w.yStart - t * dy);
            if (d < best) {
              best = d;
              id = w.id;
            }
          }
          live.current.onSelect({ kind: "wall", id });
        } else live.current.onSelect(obj?.userData.selection ?? null);
      };
      renderer.domElement.addEventListener("pointerdown", down);
      renderer.domElement.addEventListener("pointerup", up);
      transform.addEventListener("dragging-changed", (e) => {
        orbit.enabled = !e.value;
        dragged = true;
      });
      transform.addEventListener("mouseUp", () => {
        const obj = transform.object;
        if (!obj) return;
        live.current.onTransform(obj.userData.selection.id, {
          x: obj.position.x * 100,
          y: obj.position.z * 100,
          elevation: obj.position.y * 100,
          angle: -obj.rotation.y,
        });
      });
      const keys = new Set<string>();
      const keyDown = (e: KeyboardEvent) => {
          if (
            ["INPUT", "TEXTAREA", "SELECT"].includes(
              (e.target as HTMLElement).tagName,
            )
          )
            return;
          keys.add(e.code);
        },
        keyUp = (e: KeyboardEvent) => keys.delete(e.code);
      window.addEventListener("keydown", keyDown);
      window.addEventListener("keyup", keyUp);
      let last = performance.now(),
        stamp = last,
        frames = 0;
      function blocked(x: number, z: number) {
        const h = live.current.home;
        for (const w of h.walls) {
          if (w.height < 150) continue;
          const dx = w.xEnd - w.xStart,
            dy = w.yEnd - w.yStart,
            len = Math.hypot(dx, dy);
          if (!len) continue;
          const t =
            ((x * 100 - w.xStart) * dx + (z * 100 - w.yStart) * dy) /
            (len * len);
          if (t < 0 || t > 1) continue;
          const d = Math.hypot(
            x * 100 - w.xStart - t * dx,
            z * 100 - w.yStart - t * dy,
          );
          if (
            d < w.thickness / 2 + 16 &&
            !openingsForWall(w, h.openings).some(
              (o) =>
                o.elevation < 10 &&
                o.height > 180 &&
                t * len > o.start + 16 &&
                t * len < o.end - 16,
            )
          )
            return true;
        }
        return false;
      }
      renderer.setAnimationLoop(() => {
        const now = performance.now(),
          dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        if (live.current.walkMode && walk.isLocked) {
          const speed = (keys.has("ShiftLeft") ? 3 : 1.5) * dt,
            dir = camera.getWorldDirection(new T.Vector3());
          dir.y = 0;
          dir.normalize();
          const side = new T.Vector3(-dir.z, 0, dir.x),
            delta = new T.Vector3();
          if (keys.has("KeyW") || keys.has("ArrowUp")) delta.add(dir);
          if (keys.has("KeyS") || keys.has("ArrowDown")) delta.sub(dir);
          if (keys.has("KeyD") || keys.has("ArrowRight")) delta.add(side);
          if (keys.has("KeyA") || keys.has("ArrowLeft")) delta.sub(side);
          delta.multiplyScalar(speed);
          if (!blocked(camera.position.x + delta.x, camera.position.z))
            camera.position.x += delta.x;
          if (!blocked(camera.position.x, camera.position.z + delta.z))
            camera.position.z += delta.z;
          camera.position.y = 1.6;
        } else orbit.update();
        runtime.current?.selection?.update();
        if (live.current.home.lighting.quality === "low")
          renderer.render(scene, camera);
        else composer.render();
        frames++;
        if (now - stamp > 1500) {
          const fps = (frames * 1000) / (now - stamp);
          if (runtime.current) runtime.current.fps = fps;
          let triangles = 0;
          model.traverse((o) => {
            if (o instanceof T.Mesh && o.visible)
              triangles +=
                (o.geometry.index?.count ??
                  o.geometry.attributes.position.count) / 3;
          });
          setMetrics(
            `${fps.toFixed(0)} fps · ${Math.round(triangles).toLocaleString()} triangles`,
          );
          stamp = now;
          frames = 0;
        }
      });
      setReady(true);
      frameHome();
      return () => {
        renderer.setAnimationLoop(null);
        ro.disconnect();
        window.removeEventListener("keydown", keyDown);
        window.removeEventListener("keyup", keyUp);
        renderer.domElement.removeEventListener("pointerdown", down);
        renderer.domElement.removeEventListener("pointerup", up);
        transform.dispose();
        walk.dispose();
        orbit.dispose();
        dispose(model);
        composer.dispose();
        env.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        runtime.current = null;
      };
    }, []);
    useEffect(() => {
      const r = runtime.current;
      if (!r || !ready) return;
      const archSig = JSON.stringify([home.walls, home.openings]);
      if (archSig !== r.archSig) {
        r.model.children
          .filter((c) => c.name === "Architecture")
          .forEach(dispose);
        r.model.add(buildArchitecture(home));
        r.archSig = archSig;
      }
      const floorSig = JSON.stringify([home.rooms, home.zones, ceilings]);
      if (floorSig !== r.floorSig) {
        r.model.children
          .filter((c) => c.name === "Floors and ceilings")
          .forEach(dispose);
        r.model.add(buildSurfaces(home, ceilings));
        r.floorSig = floorSig;
      }
      let cancelled = false;
      const entities = [...home.openings, ...home.furniture];
      const ids = new Set(entities.map((f) => f.id));
      for (const [id, item] of r.objects)
        if (!ids.has(id)) {
          dispose(item.object);
          r.objects.delete(id);
        }
      for (const f of entities) {
        const signature = JSON.stringify(f);
        const current = r.objects.get(f.id);
        if (current?.signature === signature) {
          current.object.visible =
            !f.hidden && !(shellOnly && f.kind === "furniture");
          continue;
        }
        if (current) {
          dispose(current.object);
          r.objects.delete(f.id);
        }
        const job = buildObject(f, home).then((obj) => {
          if (cancelled) {
            dispose(obj);
            return;
          }
          obj.visible = !f.hidden && !(shellOnly && f.kind === "furniture");
          if (obj.userData.assetWarning)
            live.current.onAssetWarning(
              f.name + ": " + obj.userData.assetWarning,
            );
          r.model.add(obj);
          r.objects.set(f.id, { signature, object: obj });
          if (live.current.selection?.id === f.id) {
            r.transform.attach(obj);
          }
        });
        pending.current.add(job);
        job.finally(() => pending.current.delete(job));
      }
      return () => {
        cancelled = true;
      };
    }, [home, ceilings, shellOnly, ready]);
    useEffect(() => {
      const r = runtime.current;
      if (!r || !ready) return;
      const h = live.current.home,
        q = h.lighting.quality ?? "balanced";
      r.renderer.setPixelRatio(
        Math.min(devicePixelRatio, q === "low" ? 1 : q === "high" ? 2 : 1.5),
      );
      r.renderer.setSize(host.current!.clientWidth, host.current!.clientHeight);
      r.composer.setSize(host.current!.clientWidth, host.current!.clientHeight);
      r.ao.enabled = q !== "low";
      r.model.children.filter((c) => c.name === "Lighting").forEach(dispose);
      const lights = new T.Group();
      lights.name = "Lighting";
      lights.add(
        new T.HemisphereLight("#f4ead7", "#776955", h.lighting.ambient),
      );
      const sun = new T.DirectionalLight("#fff0d2", h.lighting.daylight);
      const a = T.MathUtils.degToRad(h.lighting.sunAzimuth),
        e = T.MathUtils.degToRad(h.lighting.sunElevation);
      sun.position.set(
        9 + Math.cos(a) * 20 * Math.cos(e),
        Math.sin(e) * 20,
        5 + Math.sin(a) * 20 * Math.cos(e),
      );
      sun.target.position.set(9, 0, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.setScalar(
        q === "low" ? 1024 : q === "high" ? 4096 : 2048,
      );
      Object.assign(sun.shadow.camera, {
        left: -13,
        right: 13,
        top: 13,
        bottom: -13,
        near: 0.5,
        far: 60,
      });
      sun.shadow.normalBias = 0.025;
      lights.add(sun, sun.target);
      for (const [x, z] of [
        [10, 4],
        [12, 4],
        [2, 3],
        [5, 3],
        [16, 4],
        [11, 8],
      ]) {
        const p = new T.PointLight(
          "#ffcf91",
          h.lighting.preset === "evening" ? 18 : 5,
          5,
          2,
        );
        p.position.set(x, 2.65, z);
        lights.add(p);
      }
      r.model.children
        .filter((c) => c.name === "Practical lights")
        .forEach(dispose);
      const practical = new T.Group();
      practical.name = "Practical lights";
      for (const z of h.zones.filter((z) =>
        ["living", "dining", "master", "office"].includes(z.id),
      )) {
        const p = z.points;
        const minX = Math.min(...p.map((p) => p.x)) / 100,
          maxX = Math.max(...p.map((p) => p.x)) / 100,
          minZ = Math.min(...p.map((p) => p.y)) / 100;
        const strip = new T.Mesh(
          new T.BoxGeometry(maxX - minX, 0.015, 0.025),
          new T.MeshStandardMaterial({
            color: "#ffe4ab",
            emissive: "#ffcf7d",
            emissiveIntensity: 2,
          }),
        );
        strip.position.set((minX + maxX) / 2, 2.88, minZ + 0.04);
        practical.add(strip);
      }
      r.model.add(practical);
      r.model.add(lights);
      const originalEnvironment = r.scene.environment;
      let hdrTexture: T.DataTexture | undefined;
      const bytes = h.assets["design/studio.hdr"];
      if (bytes) {
        try {
          const data = new HDRLoader().parse(Uint8Array.from(bytes).buffer);
          const tex = new T.DataTexture(
            data.data,
            data.width,
            data.height,
            data.format,
            data.type,
          );
          tex.mapping = T.EquirectangularReflectionMapping;
          tex.needsUpdate = true;
          hdrTexture = tex;
          r.scene.environment = tex;
          r.scene.environmentIntensity =
            h.lighting.preset === "evening" ? 0.35 : 0.7;
        } catch {
          /* RoomEnvironment remains available. */
        }
      }
      return () => {
        if (hdrTexture) {
          r.scene.environment = originalEnvironment;
          hdrTexture.dispose();
        }
        sun.shadow.dispose();
      };
    }, [home.lighting, home.zones, home.assets, ready]);
    useEffect(() => {
      const r = runtime.current;
      if (!r) return;
      r.orbit.enabled = !props.walkMode;
      r.orbit.maxPolarAngle = props.walkMode ? Math.PI * 0.9 : Math.PI * 0.49;
      if (!props.walkMode) r.walk.unlock();
      r.transform.setMode(props.transformMode);
      r.transform.setTranslationSnap(props.snap ? props.snap / 100 : null);
      r.transform.setRotationSnap(props.snap ? Math.PI / 12 : null);
      r.transform.detach();
      if (r.selection) {
        r.scene.remove(r.selection);
        r.selection.dispose();
        r.selection = null;
      }
      if (props.selection?.kind === "furniture") {
        const obj = r.objects.get(props.selection.id)?.object;
        if (obj?.visible) {
          r.transform.attach(obj);
          r.selection = new T.BoxHelper(obj, "#c99650");
          r.scene.add(r.selection);
        }
      }
    }, [
      props.selection,
      props.transformMode,
      props.snap,
      props.walkMode,
      props.home,
    ]);
    useImperativeHandle(ref, () => ({
      frameHome,
      view,
      currentView() {
        const r = runtime.current;
        return r
          ? {
              id: crypto.randomUUID(),
              name: "Saved view",
              position: r.camera.position.toArray(),
              target: r.orbit.target.toArray(),
            }
          : null;
      },
      async exportGlb() {
        const r = runtime.current;
        if (!r) throw Error("Scene is not ready");
        await Promise.all([...pending.current]);
        const result = await new GLTFExporter().parseAsync(prepareGlbExport(r.model), {
          binary: true,
          onlyVisible: true,
        });
        return new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
      },
      capturePng: () =>
        runtime.current?.renderer.domElement.toDataURL("image/png") ?? null,
    }));
    return (
      <div className="scene-host" ref={host} aria-label="Interactive 3D model">
        <div className="render-stats">
          {metrics}
          {props.walkMode
            ? " · Click scene to look · WASD to walk · Esc to release"
            : ""}
        </div>
      </div>
    );
  },
);
