import * as T from "three";
import clipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import type { HomeModel, Wall } from "./types";
import { openingsForWall } from "./geometry";
import { material } from "./materials";
function wallPolygon(
  w: Wall,
  start = 0,
  end = Math.hypot(w.xEnd - w.xStart, w.yEnd - w.yStart),
  extra = 0,
): Polygon {
  const len = Math.hypot(w.xEnd - w.xStart, w.yEnd - w.yStart),
    ux = (w.xEnd - w.xStart) / len,
    uy = (w.yEnd - w.yStart) / len,
    t = w.thickness / 2 + extra;
  return [
    [
      [w.xStart + ux * start - uy * t, w.yStart + uy * start + ux * t],
      [w.xStart + ux * end - uy * t, w.yStart + uy * end + ux * t],
      [w.xStart + ux * end + uy * t, w.yStart + uy * end - ux * t],
      [w.xStart + ux * start + uy * t, w.yStart + uy * start - ux * t],
    ],
  ] as Polygon;
}
export function wallSlabs(home: HomeModel) {
  const walls = home.walls.filter(
    (w) =>
      !w.hidden &&
      w.thickness > 0 &&
      Math.hypot(w.xEnd - w.xStart, w.yEnd - w.yStart) > 0.01,
  );
  const cuts = new Map(
    walls.map((w) => [
      w.id,
      openingsForWall(
        w,
        home.openings.filter((o) => !o.hidden),
      ),
    ]),
  );
  const levels = [
    ...new Set([
      0,
      ...walls.map((w) => w.height),
      ...home.openings.flatMap((o) => [o.elevation, o.elevation + o.height]),
    ]),
  ]
    .filter((n) => n >= 0)
    .sort((a, b) => a - b);
  const result: Array<{ bottom: number; top: number; polygons: MultiPolygon }> =
    [];
  for (let i = 0; i < levels.length - 1; i++) {
    const bottom = levels[i],
      top = levels[i + 1],
      mid = (bottom + top) / 2;
    const active = walls.filter((w) => w.height > mid);
    if (!active.length) continue;
    let union = clipping.union(
      wallPolygon(active[0]),
      ...active.slice(1).map((w) => wallPolygon(w)),
    );
    const holes: Polygon[] = [];
    for (const w of active)
      for (const cut of cuts.get(w.id) ?? [])
        if (cut.elevation < mid && cut.elevation + cut.height > mid)
          holes.push(wallPolygon(w, cut.start, cut.end, 1));
    if (holes.length) union = clipping.difference(union, ...holes);
    result.push({ bottom, top, polygons: union });
  }
  return result;
}
export function shapeFor(rings: number[][][]) {
  const s = new T.Shape(
    rings[0].map((p) => new T.Vector2(p[0] / 100, -p[1] / 100)),
  );
  for (const ring of rings.slice(1))
    s.holes.push(
      new T.Path(ring.map((p) => new T.Vector2(p[0] / 100, -p[1] / 100))),
    );
  return s;
}
export function buildArchitecture(home: HomeModel) {
  const g = new T.Group();
  g.name = "Architecture";
  const mat = material("ivory");
  for (const slab of wallSlabs(home))
    for (const poly of slab.polygons) {
      const mesh = new T.Mesh(
        new T.ExtrudeGeometry(shapeFor(poly), {
          depth: (slab.top - slab.bottom) / 100,
          bevelEnabled: false,
        }),
        mat,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = slab.bottom / 100;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.architecture = true;
      g.add(mesh);
    }
  for (const w of home.walls.filter((w) => w.color || w.finish)) {
    const len = Math.hypot(w.xEnd - w.xStart, w.yEnd - w.yStart),
      dx = (w.xEnd - w.xStart) / len,
      dy = (w.yEnd - w.yStart) / len;
    const cuts = openingsForWall(w, home.openings);
    const levels = [
      0,
      w.height,
      ...cuts.flatMap((o) => [
        o.elevation,
        Math.min(w.height, o.elevation + o.height),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < levels.length - 1; i++) {
      const bottom = levels[i],
        top = levels[i + 1];
      if (top <= bottom) continue;
      const active = cuts.filter(
        (o) =>
          o.elevation < (bottom + top) / 2 &&
          o.elevation + o.height > (bottom + top) / 2,
      );
      let cursor = 0;
      for (const cut of [...active, { start: len, end: len }]) {
        if (cut.start > cursor)
          for (const side of [-1, 1]) {
            const m = material(w.finish ?? "ivory", w.color);
            m.side = T.DoubleSide;
            const q = new T.Mesh(
              new T.PlaneGeometry(
                (cut.start - cursor) / 100,
                (top - bottom) / 100,
              ),
              m,
            );
            const t = (cursor + cut.start) / 2;
            q.position.set(
              (w.xStart + dx * t - dy * side * (w.thickness / 2 + 0.03)) / 100,
              (top + bottom) / 200,
              (w.yStart + dy * t + dx * side * (w.thickness / 2 + 0.03)) / 100,
            );
            q.rotation.y = -Math.atan2(dy, dx);
            q.userData.selection = { kind: "wall", id: w.id };
            g.add(q);
          }
        cursor = Math.max(cursor, cut.end);
      }
    }
  }
  return g;
}
export function buildSurfaces(home: HomeModel, ceilings: boolean) {
  const g = new T.Group();
  g.name = "Floors and ceilings";
  const build = (
    points: Array<{ x: number; y: number }>,
    finish: Parameters<typeof material>[0],
    y: number,
    name: string,
    id?: string,
    color?: string,
  ) => {
    if (points.length < 3) return;
    const geom = new T.ShapeGeometry(shapeFor([points.map((p) => [p.x, p.y])]));
    const mat = material(finish, color);
    mat.side = T.DoubleSide;
    const m = new T.Mesh(geom, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.name = name;
    m.receiveShadow = true;
    if (id) m.userData.selection = { kind: "room", id };
    g.add(m);
  };
  home.rooms
    .filter((r) => !r.hidden)
    .forEach((r) => {
      build(
        r.points,
        r.finish ?? "stone",
        r.finish || r.color ? 0.012 : 0.003,
        r.name,
        r.id,
        r.color,
      );
      if (ceilings && r.ceilingVisible)
        build(r.points, "ivory", home.wallHeight / 100, r.name + " ceiling");
    });
  home.zones.forEach((z) => {
    build(z.points, z.finish, 0.008, z.name + " provisional finish");
    if (ceilings && !["balcony", "hall"].includes(z.id))
      build(
        z.points,
        "ivory",
        home.wallHeight / 100 - 0.005,
        z.name + " provisional ceiling",
      );
  });
  return g;
}
