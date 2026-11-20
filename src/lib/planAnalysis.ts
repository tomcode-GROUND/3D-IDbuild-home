import { z } from "./validation.ts";
import { parseHomeXml } from "./sh3d.ts";
import type { HomeModel } from "./types.ts";

const point = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
const cm = z.number().positive().max(100_000);
const evidence = z.object({
  label: z.string().max(160),
  status: z.enum(["observed", "estimated", "unresolved"]),
  cm: cm.nullable(),
  a: point.nullable(),
  b: point.nullable(),
  source: z.string().max(300),
});
export const proposalSchema = z.object({
  summary: z.string().max(2500),
  questions: z.array(z.string().max(350)).max(15),
  measurements: z.array(evidence).max(80),
  walls: z
    .array(z.object({ a: point, b: point, thicknessCm: cm.nullable() }))
    .max(180),
  rooms: z
    .array(
      z.object({
        name: z.string().max(120),
        points: z.array(point).min(3).max(32),
      }),
    )
    .max(55),
  openings: z
    .array(
      z.object({
        type: z.enum(["door", "window"]),
        wall: z.number().int().min(0).max(179),
        start: z.number().min(0).max(1),
        end: z.number().min(0).max(1),
        heightCm: cm.nullable(),
        sillCm: z.number().min(0).max(10_000).nullable(),
      }),
    )
    .max(160),
});
export type Proposal = z.infer<typeof proposalSchema>;
export type Point = z.infer<typeof point>;
export const reviewSchema = z.object({
  a: point.nullable(),
  b: point.nullable(),
  distance: z.string().max(24),
  height: z.string().max(24),
  approved: z.boolean(),
});
export type Review = z.infer<typeof reviewSchema>;
export const blankReview: Review = {
  a: null,
  b: null,
  distance: "",
  height: "",
  approved: false,
};
const distance = (a: Point, b: Point, width: number, height: number) =>
  Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const on = (p: Point, q: Point, r: Point) =>
    Math.abs(cross(p, q, r)) < 1e-10 &&
    r.x >= Math.min(p.x, q.x) &&
    r.x <= Math.max(p.x, q.x) &&
    r.y >= Math.min(p.y, q.y) &&
    r.y <= Math.max(p.y, q.y);
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function parseProposal(data: unknown): Proposal {
  const result = proposalSchema.parse(data);
  for (const m of result.measurements) {
    if (
      !m.source.trim() ||
      (m.status === "unresolved") !== (m.cm === null) ||
      Boolean(m.a) !== Boolean(m.b) ||
      (m.a && m.b && distance(m.a, m.b, 1, 1) < 0.001)
    )
      throw Error("A measurement has inconsistent evidence.");
  }
  if (
    result.walls.some(
      (w) => distance(w.a, w.b, 1, 1) < 0.001 || (w.thicknessCm ?? 12) > 100,
    )
  )
    throw Error("The wall trace contains invalid segments.");
  if (
    result.openings.some(
      (o) => !result.walls[o.wall] || o.end - o.start < 0.001,
    )
  )
    throw Error("An opening has an invalid wall reference or span.");
  for (const room of result.rooms) {
    const p = room.points;
    let area = 0;
    for (let i = 0; i < p.length; i++) {
      const next = (i + 1) % p.length;
      area += p[i].x * p[next].y - p[next].x * p[i].y;
      if (distance(p[i], p[next], 1, 1) < 0.001)
        throw Error("A room has repeated points.");
      for (let j = i + 2; j < p.length; j++) {
        if (i === 0 && j === p.length - 1) continue;
        if (intersects(p[i], p[next], p[j], p[(j + 1) % p.length]))
          throw Error("A room boundary crosses itself.");
      }
    }
    if (Math.abs(area) < 0.00001)
      throw Error("A room boundary has no usable area.");
  }
  return result;
}

export function reviewPlan(
  proposal: Proposal,
  review: Review,
  width: number,
  height: number,
) {
  const span =
    review.a && review.b ? distance(review.a, review.b, width, height) : 0;
  const length = Number(review.distance);
  const ceiling = Number(review.height);
  const issues: string[] = [];
  if (span < 8 || !Number.isFinite(length) || length < 10 || length > 50_000)
    issues.push(
      "Select two scale endpoints and enter their known distance in cm (10–50,000).",
    );
  if (!Number.isFinite(ceiling) || ceiling < 150 || ceiling > 2000)
    issues.push("Confirm the ceiling height in cm (150–2,000).");
  if (!proposal.rooms.length || !proposal.walls.length)
    issues.push("A trace needs at least one closed room and one wall.");
  const scale = issues.length ? 0 : length / span;
  const warnings: string[] = [];
  if (scale) {
    for (const m of proposal.measurements) {
      if (m.status !== "observed" || !m.a || !m.b || !m.cm) continue;
      const predicted = scale * distance(m.a, m.b, width, height);
      if (Math.abs(predicted - m.cm) > Math.max(5, m.cm * 0.05))
        warnings.push(
          `${m.label}: label ${m.cm} cm differs from calibrated span ${Math.round(predicted)} cm.`,
        );
    }
    if (proposal.walls.some((w) => w.thicknessCm === null))
      warnings.push("Unspecified wall thickness uses a provisional 12 cm.");
    if (
      proposal.openings.some(
        (o) =>
          o.heightCm === null || (o.type === "window" && o.sillCm === null),
      )
    )
      warnings.push(
        "Unspecified opening heights are provisional (door 210 cm, window 110 cm, sill 90 cm).",
      );
    if (
      proposal.openings.some((o) => {
        const sill = o.type === "door" ? 0 : (o.sillCm ?? 90);
        return sill + (o.heightCm ?? (o.type === "door" ? 210 : 110)) > ceiling;
      })
    )
      issues.push(
        "An opening exceeds the confirmed ceiling height. Correct its height or sill.",
      );
    if (
      proposal.walls.some(
        (w) => scale * distance(w.a, w.b, width, height) < 1,
      ) ||
      proposal.openings.some(
        (o) =>
          (o.end - o.start) *
            scale *
            distance(
              proposal.walls[o.wall].a,
              proposal.walls[o.wall].b,
              width,
              height,
            ) <
          5,
      )
    )
      issues.push(
        "A wall or opening is too small at the confirmed scale. Check the trace and scale.",
      );
    if (Math.max(width, height) * scale > 100_000)
      issues.push("The calibrated image exceeds the supported model size.");
  }
  return { issues, warnings, scale, ceiling };
}
export function buildPlan(
  proposal: Proposal,
  review: Review,
  image: Uint8Array,
  width: number,
  height: number,
  name: string,
): HomeModel {
  proposal = parseProposal(proposal);
  const { issues, warnings, scale, ceiling } = reviewPlan(
    proposal,
    review,
    width,
    height,
  );
  if (issues.length || !review.approved)
    throw Error(issues[0] ?? "Approve the provisional trace first.");
  const home = parseHomeXml("<home/>");
  const world = (p: Point) => ({
    x: p.x * width * scale,
    y: p.y * height * scale,
  });
  const base = (id: string, name: string, p: Point) => ({
    id,
    name,
    ...p,
    elevation: 0,
    angle: 0,
  });
  home.name = name;
  home.wallHeight = ceiling;
  home.backgroundImage = image;
  home.background = { scale, xOrigin: 0, yOrigin: 0 };
  home.warnings = [
    "AI-assisted trace · internal geometry remains provisional.",
    ...warnings,
    ...proposal.questions,
  ];
  home.walls = proposal.walls.map((w, i) => {
    const a = world(w.a),
      b = world(w.b);
    return {
      ...base(`wall-${i}`, `Wall ${i + 1}`, a),
      kind: "wall",
      xStart: a.x,
      yStart: a.y,
      xEnd: b.x,
      yEnd: b.y,
      height: ceiling,
      thickness: w.thicknessCm ?? 12,
    };
  });
  home.rooms = proposal.rooms.map((r, i) => ({
    ...base(`room-${i}`, r.name || `Room ${i + 1}`, world(r.points[0])),
    kind: "room",
    points: r.points.map(world),
    ceilingVisible: true,
    ceilingFlat: true,
  }));
  home.openings = proposal.openings.map((o, i) => {
    const w = home.walls[o.wall],
      t = (o.start + o.end) / 2;
    const dx = w.xEnd - w.xStart,
      dy = w.yEnd - w.yStart;
    return {
      ...base(
        `opening-${i}`,
        `${o.type === "door" ? "Door" : "Window"} ${i + 1}`,
        { x: w.xStart + dx * t, y: w.yStart + dy * t },
      ),
      kind: "opening",
      angle: Math.atan2(dy, dx),
      width: Math.hypot(dx, dy) * (o.end - o.start),
      depth: w.thickness,
      height: o.heightCm ?? (o.type === "door" ? 210 : 110),
      elevation: o.type === "door" ? 0 : (o.sillCm ?? 90),
      modelMirrored: false,
      boundToWall: true,
    };
  });
  return home;
}
