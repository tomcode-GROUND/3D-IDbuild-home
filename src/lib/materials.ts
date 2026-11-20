import * as T from "three";
import type { Finish } from "./types";
const colors: Record<Finish, string> = {
  ivory: "#dfd4bf",
  walnut: "#60442f",
  stone: "#cbbb9e",
  bronze: "#a48253",
  fabric: "#e4d9c6",
  greige: "#a79d8c",
};
const textures = new Map<string, T.CanvasTexture>();
export function texture(finish: Finish) {
  if (textures.has(finish)) return textures.get(finish)!;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = colors[finish];
  ctx.fillRect(0, 0, 256, 256);
  let seed = 123;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 6000; i++) {
    const v = rnd();
    ctx.strokeStyle =
      finish === "walnut"
        ? `rgba(25,13,5,${v * 0.15})`
        : `rgba(255,255,255,${v * 0.13})`;
    ctx.lineWidth = finish === "stone" ? 0.4 : 1;
    ctx.beginPath();
    const x = rnd() * 256,
      y = rnd() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(
      finish === "walnut" ? x + rnd() * 90 : x + v * 4,
      finish === "walnut" ? y + Math.sin(x / 30) * 2 : y + v * 7,
    );
    ctx.stroke();
  }
  if (finish === "stone") {
    ctx.strokeStyle = "rgba(100,83,58,.14)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      let y = rnd() * 256;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(70, y + 20, 120, y - 35, 256, y + 25);
      ctx.stroke();
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(finish === "walnut" ? 2 : 3, finish === "walnut" ? 1 : 3);
  textures.set(finish, t);
  return t;
}
export function material(finish: Finish = "ivory", color?: string) {
  return new T.MeshPhysicalMaterial({
    color: color ?? "#ffffff",
    map: texture(finish),
    roughness:
      finish === "bronze"
        ? 0.28
        : finish === "stone"
          ? 0.42
          : finish === "fabric"
            ? 0.9
            : 0.62,
    metalness: finish === "bronze" ? 0.82 : 0,
    sheen: finish === "fabric" ? 0.65 : 0,
    sheenColor: new T.Color("#fff1dc"),
    clearcoat: finish === "stone" ? 0.18 : 0,
  });
}
