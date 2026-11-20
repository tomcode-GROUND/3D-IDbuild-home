import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as T from "three";
import { zipSync, strToU8 } from "fflate";
import {
  parseSh3d,
  parseHomeXml,
  createProjectArchive,
  parseProjectArchive,
} from "./sh3d";
import { furnish, clearanceWarnings } from "./design";
import { openingsForWall } from "./geometry";
import { wallSlabs } from "./architecture";
import { fitModel } from "./furniture";
import type { Wall, Opening } from "./types";
const shell = new Uint8Array(
  readFileSync(new URL("../../public/fixtures/juniper.sh3d", import.meta.url)),
);
const wall: Wall = {
  id: "w",
  kind: "wall",
  name: "wall",
  x: 150,
  y: 0,
  elevation: 0,
  angle: 0,
  xStart: 0,
  yStart: 0,
  xEnd: 300,
  yEnd: 0,
  height: 300,
  thickness: 20,
};
const opening: Opening = {
  id: "o",
  kind: "opening",
  name: "door",
  x: 150,
  y: 29.25,
  elevation: 0,
  angle: 0,
  width: 90,
  depth: 68,
  height: 210,
  modelMirrored: false,
  boundToWall: false,
  wallThickness: 7.5 / 68,
  wallDistance: 1 / 68,
};
describe("fictional apartment", () => {
  it("preserves the latest architecture and height distinctions", () => {
    const h = parseSh3d(shell);
    expect([
      h.walls.length,
      h.openings.length,
      h.rooms.length,
      h.furniture.length,
    ]).toEqual([7, 3, 2, 1]);
    expect(h.walls.filter((w) => w.height === 110)).toHaveLength(1);
    expect(h.walls.filter((w) => w.height === 270)).toHaveLength(6);
    expect(
      h.openings.every((opening) =>
        h.walls.some((wall) => openingsForWall(wall, [opening]).length),
      ),
    ).toBe(true);
  });
  it("furnishes the public apartment with a bed, work area and four-seat table", () => {
    const h = furnish(parseSh3d(shell));
    expect(h.furniture.filter((f) => f.generator === "bed")).toHaveLength(1);
    expect(h.furniture.filter((f) => f.generator === "desk")).toHaveLength(1);
    expect(h.furniture.filter((f) => f.generator === "chair")).toHaveLength(4);
    expect(h.furniture.every((f) => f.model === undefined)).toBe(true);
    expect(clearanceWarnings(h)).toEqual(expect.any(Array));
  });
  it("round-trips source bytes, procedural furniture, assets and lighting in a v2 archive", () => {
    const h = furnish(parseSh3d(shell));
    h.assets["design/sample.obj"] = strToU8("v 0 0 0");
    h.furniture[0].hidden = true;
    h.furniture[1].finish = "greige";
    h.lighting.preset = "evening";
    const restored = parseProjectArchive(
      createProjectArchive({ name: "shell.sh3d", bytes: shell }, h),
    );
    expect(Buffer.compare(restored.source.bytes, shell)).toBe(0);
    expect(restored.home.furniture).toEqual(h.furniture);
    expect(restored.home.zones).toEqual(h.zones);
    expect(
      Buffer.compare(
        restored.home.assets["design/sample.obj"],
        h.assets["design/sample.obj"],
      ),
    ).toBe(0);
    expect(restored.home.lighting.preset).toBe("evening");
  });
  it("migrates legacy editor projects without overwriting source geometry", () => {
    const h = parseSh3d(shell);
    const bytes = zipSync({
      "source.sh3d": shell,
      "manifest.json": strToU8(
        JSON.stringify({
          format: "fdwz-3d-editor",
          version: 1,
          sourceName: "legacy.sh3d",
          state: {
            walls: h.walls,
            rooms: h.rooms,
            openings: h.openings,
            furniture: [],
            lighting: h.lighting,
          },
        }),
      ),
    });
    const result = parseProjectArchive(bytes);
    expect(result.home.zones).toEqual([]);
    expect(result.home.walls).toEqual(h.walls);
  });
  it("rejects invalid XML and untrusted archive paths", () => {
    expect(() => parseHomeXml("<home><wall></home>")).toThrow();
    expect(() =>
      parseHomeXml('<!DOCTYPE home [<!ENTITY x SYSTEM "file:///x">]><home/>'),
    ).toThrow();
    expect(() =>
      parseSh3d(zipSync({ "../Home.xml": strToU8("<home/>") })),
    ).toThrow();
  });
});
describe("geometry correctness", () => {
  it("places an offset SH3D cutout on the actual wall, ignores stale flags and perpendicular openings", () => {
    expect(openingsForWall(wall, [opening])).toHaveLength(1);
    expect(
      openingsForWall(wall, [{ ...opening, angle: Math.PI / 2 }]),
    ).toHaveLength(0);
  });
  it("unions overlapping wall volumes while retaining source objects", () => {
    const h = parseHomeXml("<home/>");
    h.walls = [wall, { ...wall, id: "w2", xStart: 100, xEnd: 400 }];
    h.openings = [];
    const slabs = wallSlabs(h);
    const area = slabs[0].polygons.reduce(
      (s, p) =>
        s +
        Math.abs(
          p[0].reduce((v, a, i) => {
            const b = p[0][(i + 1) % p[0].length];
            return v + a[0] * b[1] - b[0] * a[1];
          }, 0) / 2,
        ),
      0,
    );
    expect(area).toBeCloseTo(8000);
    expect(h.walls).toHaveLength(2);
  });
  it("centres off-origin OBJ geometry correctly before dimension scaling", () => {
    const m = new T.Mesh(new T.BoxGeometry(10, 20, 30));
    m.position.set(40, 50, 60);
    const fitted = fitModel(m, 1, 2, 3);
    const b = new T.Box3().setFromObject(fitted),
      s = b.getSize(new T.Vector3());
    expect(s.toArray()).toEqual([1, 2, 3]);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.getCenter(new T.Vector3()).x).toBeCloseTo(0);
  });
});
