import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeCoincidentWalls } from "./geometry";
import {
  createProjectArchive,
  parseProjectArchive,
  parseSh3d,
  totalArea,
} from "./sh3d";

const fixture = new Uint8Array(
  readFileSync(new URL("../../public/fixtures/juniper.sh3d", import.meta.url)),
);

describe("juniper SH3D importer", () => {
  it("preserves the supplied home structure", () => {
    const home = parseSh3d(fixture);
    expect(home.walls).toHaveLength(7);
    expect(home.rooms).toHaveLength(2);
    expect(home.openings).toHaveLength(3);
    expect(home.furniture).toHaveLength(1);
    expect(totalArea(home.rooms)).toBeCloseTo(32.5632, 4);
  });

  it("merges only coincident wall runs for preview", () => {
    const home = parseSh3d(fixture);
    const previewWalls = mergeCoincidentWalls(home.walls);
    expect(previewWalls.length).toBeLessThan(home.walls.length);
    expect(previewWalls.flatMap((wall) => wall.sourceIds ?? [])).toEqual(
      expect.arrayContaining(home.walls.map((wall) => wall.id)),
    );
  });

  it("round-trips edits through the editor project archive", () => {
    const home = parseSh3d(fixture);
    const edited = structuredClone(home);
    edited.furniture[0].x += 20;
    edited.lighting.daylight = 3.4;
    const archive = createProjectArchive(
      { name: "juniper.sh3d", bytes: fixture },
      edited,
    );
    const restored = parseProjectArchive(archive);
    expect(restored.home.furniture[0].x).toBe(home.furniture[0].x + 20);
    expect(restored.home.lighting.daylight).toBe(3.4);
    expect(restored.source.bytes.byteLength).toBe(fixture.byteLength);
  });

  it("rejects a non-SH3D archive", () => {
    expect(() => parseSh3d(new Uint8Array([1, 2, 3]))).toThrow(
      /ZIP-based SH3D/,
    );
  });
});
