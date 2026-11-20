import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blankReview,
  buildPlan,
  parseProposal,
  reviewPlan,
} from "./planAnalysis";
import type { Proposal } from "./planAnalysis";
import { checkPdfPage, planKind } from "./planFiles";
import {
  copyProject,
  listLocal,
  loadLocal,
  newProject,
  openProject,
  packProject,
  saveLocal,
} from "./projects";
import { openingsForWall } from "./geometry";

const a = { x: 0.1, y: 0.2 },
  b = { x: 0.9, y: 0.2 };
const c = { x: 0.9, y: 0.8 },
  d = { x: 0.1, y: 0.8 };
export const synthetic: Proposal = {
  summary: "Room traced.",
  questions: ["Confirm ceiling height."],
  measurements: [
    {
      label: "North wall",
      status: "observed",
      cm: 400,
      a,
      b,
      source: "400 cm label",
    },
  ],
  walls: [
    { a, b, thicknessCm: null },
    { a: b, b: c, thicknessCm: 12 },
    { a: c, b: d, thicknessCm: 12 },
    { a: d, b: a, thicknessCm: 12 },
  ],
  rooms: [{ name: "Room", points: [a, b, c, d] }],
  openings: [
    { type: "door", wall: 0, start: 0.25, end: 0.5, heightCm: 210, sillCm: 0 },
  ],
};
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 99]);
const review = { a, b, distance: "400", height: "285", approved: true };
describe("plan review", () => {
  it("rejects unsupported signatures, oversized input, and invalid PDF selections", () => {
    expect(planKind(png)).toBe("png");
    expect(planKind(Uint8Array.from([255, 216, 255]))).toBe("jpeg");
    expect(planKind(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(() => planKind(new Uint8Array(2))).toThrow();
    expect(() => planKind(new Uint8Array(20_000_001))).toThrow();
    expect(() => checkPdfPage(51, 1)).toThrow();
    expect(() => checkPdfPage(3, 4)).toThrow();
  });
  it("requires user confirmation and catches contradictory measurements", () => {
    expect(reviewPlan(synthetic, blankReview, 1000, 500).issues).toHaveLength(
      2,
    );
    expect(
      reviewPlan(
        synthetic,
        { ...review, distance: "600" },
        1000,
        500,
      ).warnings.join(" "),
    ).toContain("differs from calibrated span 600 cm");
    expect(() =>
      buildPlan(
        synthetic,
        { ...review, approved: false },
        png,
        1000,
        500,
        "House",
      ),
    ).toThrow("Approve");
    expect(
      reviewPlan(synthetic, { ...review, height: "180" }, 1000, 500).issues[0],
    ).toContain("exceeds");
  });
  it("reuses the existing geometry for a scale-correct room and opening", () => {
    const home = buildPlan(synthetic, review, png, 1000, 500, "House");
    expect(home.wallHeight).toBe(285);
    expect(home.walls[0].xEnd - home.walls[0].xStart).toBeCloseTo(400);
    expect(home.rooms[0].points[2].y - home.rooms[0].points[0].y).toBeCloseTo(
      150,
    );
    expect(openingsForWall(home.walls[0], home.openings)[0].width).toBeCloseTo(
      100,
    );
    expect(home.furniture).toEqual([]);
    expect(home.validation).toBe("provisional");
  });
  it("rejects invalid walls, self intersections and inconsistent evidence", () => {
    expect(() =>
      parseProposal({ ...synthetic, walls: [{ a, b: a, thicknessCm: 12 }] }),
    ).toThrow();
    expect(() =>
      parseProposal({
        ...synthetic,
        rooms: [{ name: "X", points: [a, c, b, d] }],
      }),
    ).toThrow();
    expect(() =>
      parseProposal({
        ...synthetic,
        measurements: [{ ...synthetic.measurements[0], cm: null }],
      }),
    ).toThrow();
    expect(() =>
      parseProposal({
        ...synthetic,
        openings: [{ ...synthetic.openings[0], wall: 9 }],
      }),
    ).toThrow();
  });
});
describe("projects", () => {
  it("restores source bytes, evidence, conversation and editable scene in IndexedDB and archives", async () => {
    const project = {
      ...newProject({ name: "plan.png", bytes: png }, "plan"),
      proposal: synthetic,
      review,
      raster: { bytes: png, width: 1000, height: 500 },
      home: buildPlan(synthetic, review, png, 1000, 500, "House"),
      messages: [{ role: "user" as const, text: "The ceiling is 285 cm." }],
      apiKey: "never-persist-this-field",
    };
    await saveLocal(project);
    const copy = copyProject(project);
    await saveLocal({ ...copy, title: "Renamed copy" });
    expect(await listLocal()).toHaveLength(2);
    expect((await loadLocal(project.id))?.title).toBe("plan");
    expect(JSON.stringify(await loadLocal(project.id))).not.toContain(
      "never-persist",
    );
    const archive = packProject(project);
    const reopened = openProject({ name: "plan.fdwz3d", bytes: archive });
    expect(reopened.id).not.toBe(project.id);
    expect(reopened.source.bytes).toEqual(png);
    expect(reopened.review).toEqual(review);
    expect(reopened.proposal).toEqual(synthetic);
    expect(reopened.messages).toEqual(project.messages);
    expect(reopened.home?.walls).toEqual(project.home.walls);
    expect(JSON.stringify(reopened)).not.toContain("never-persist");
  });
  it("migrates the furnished v2 archive and retains assets and original bytes as v3", () => {
    const bytes = new Uint8Array(
      readFileSync(
        new URL("../../public/fixtures/juniper-v2.fdwz3d", import.meta.url),
      ),
    );
    const legacy = openProject({ name: "legacy.fdwz3d", bytes });
    const restored = openProject({
      name: "v3.fdwz3d",
      bytes: packProject(legacy),
    });
    expect(restored.source.bytes).toEqual(legacy.source.bytes);
    expect(restored.home?.walls).toEqual(legacy.home?.walls);
    expect(restored.home?.furniture).toEqual(legacy.home?.furniture);
    expect(Object.keys(restored.home!.assets)).toEqual(
      Object.keys(legacy.home!.assets),
    );
  });
});
