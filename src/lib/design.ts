import type { Furniture, HomeModel } from "./types.ts";

export function furnish(home: HomeModel): HomeModel {
  const furniture: Furniture[] = [];
  const add = (
    generator: Furniture["generator"],
    name: string,
    x: number,
    y: number,
    width: number,
    depth: number,
    height: number,
    finish: Furniture["finish"],
    angle = 0,
  ) => {
    furniture.push({
      kind: "furniture",
      id: "demo-" + furniture.length,
      generator,
      name,
      x,
      y,
      width,
      depth,
      height,
      finish,
      angle,
      elevation: 0,
      movable: true,
      modelMirrored: false,
    });
  };
  add("sofa", "Linen sofa", 140, 165, 220, 88, 84, "fabric");
  add("coffee", "Stone coffee table", 140, 275, 76, 76, 43, "stone");
  add("rug", "Woven rug", 155, 258, 240, 170, 2, "fabric");
  add(
    "media",
    "Walnut media console",
    155,
    381,
    190,
    37,
    50,
    "walnut",
    Math.PI,
  );
  add("table", "Dining table", 466, 213, 100, 100, 75, "walnut");
  for (let index = 0; index < 4; index++) {
    const angle = (index * Math.PI) / 2;
    add(
      "chair",
      "Dining chair " + (index + 1),
      466 + 78 * Math.cos(angle),
      213 + 78 * Math.sin(angle),
      44,
      49,
      88,
      "fabric",
      angle + Math.PI / 2,
    );
  }
  add("counter", "Kitchen sink and counter", 485, 54, 191, 60, 91, "greige");
  add("plant", "Living-room plant", 34, 344, 36, 36, 125, "ivory");
  add("bed", "Double bed", 766, 192, 150, 202, 105, "fabric");
  add("cabinet", "Bedroom storage", 768, 365, 156, 48, 192, "walnut", Math.PI);
  add("desk", "Window desk", 660, 58, 86, 52, 75, "walnut");
  return {
    ...home,
    name: "Juniper Apartment",
    furniture,
    viewpoints: [
      {
        id: "living",
        name: "Living and dining",
        position: [3.1, 1.65, 3.7],
        target: [2.0, 1.05, 1.75],
      },
      {
        id: "dining",
        name: "Dining and kitchen",
        position: [3.4, 1.7, 3.43],
        target: [4.75, 1.1, 0.8],
      },
    ],
  };
}

export function clearanceWarnings(home: HomeModel): string[] {
  const out: string[] = [];
  const pieces = home.furniture.filter(
    (f) =>
      !f.hidden &&
      !["rug", "curtain", "pendant", "lamp", "shelf"].includes(
        f.generator ?? "",
      ),
  );
  function roundOverlap(a: Furniture, b: Furniture) {
    const round = ["table", "coffee"].includes(a.generator ?? "")
      ? a
      : ["table", "coffee"].includes(b.generator ?? "")
        ? b
        : null;
    if (!round) return true;
    const rect = round === a ? b : a;
    const dx = round.x - rect.x,
      dy = round.y - rect.y,
      c = Math.cos(rect.angle),
      s = Math.sin(rect.angle),
      x = dx * c + dy * s,
      y = -dx * s + dy * c;
    return (
      Math.hypot(
        x - Math.max(-rect.width / 2, Math.min(rect.width / 2, x)),
        y - Math.max(-rect.depth / 2, Math.min(rect.depth / 2, y)),
      ) <
      round.width / 2 - 2
    );
  }
  function bounds(f: Furniture) {
    const c = Math.abs(Math.cos(f.angle)),
      s = Math.abs(Math.sin(f.angle));
    return {
      x: f.x,
      y: f.y,
      w: c * f.width + s * f.depth,
      d: s * f.width + c * f.depth,
    };
  }
  for (let i = 0; i < pieces.length; i++) {
    const a = pieces[i],
      ab = bounds(a);
    for (const b of pieces.slice(i + 1)) {
      if (
        a.elevation >= b.elevation + b.height ||
        b.elevation >= a.elevation + a.height
      )
        continue;
      const bb = bounds(b);
      if (
        Math.abs(ab.x - bb.x) < (ab.w + bb.w) / 2 - 2 &&
        Math.abs(ab.y - bb.y) < (ab.d + bb.d) / 2 - 2 &&
        roundOverlap(a, b)
      )
        out.push("Possible overlap: " + a.name + " / " + b.name);
    }
  }
  for (const f of pieces.filter((p) => p.clearance)) {
    const b = bounds(f);
    for (const w of home.walls) {
      const dx = w.xEnd - w.xStart,
        dy = w.yEnd - w.yStart,
        l2 = dx * dx + dy * dy;
      if (!l2) continue;
      const t = Math.max(
        0,
        Math.min(1, ((f.x - w.xStart) * dx + (f.y - w.yStart) * dy) / l2),
      );
      const d = Math.hypot(f.x - w.xStart - t * dx, f.y - w.yStart - t * dy);
      if (d < Math.min(b.w, b.d) / 2 - 2) {
        out.push("Wall intersection: " + f.name);
        break;
      }
    }
  }
  // Clearance samples are conservative previews, in document centimetres.
  function inside(f: Furniture, x: number, y: number) {
    const dx = x - f.x,
      dy = y - f.y,
      c = Math.cos(f.angle),
      s = Math.sin(f.angle);
    return (
      Math.abs(dx * c + dy * s) < f.width / 2 &&
      Math.abs(-dx * s + dy * c) < f.depth / 2
    );
  }
  function blocked(f: Furniture, x: number, y: number, ignoreChairs = false) {
    if (
      pieces.some(
        (p) =>
          p.id !== f.id &&
          p.elevation < 100 &&
          (!ignoreChairs || p.generator !== "chair") &&
          inside(p, x, y),
      )
    )
      return true;
    return home.walls.some((w) => {
      const dx = w.xEnd - w.xStart,
        dy = w.yEnd - w.yStart,
        l2 = dx * dx + dy * dy;
      if (!l2 || w.height < 90) return false;
      const t = Math.max(
        0,
        Math.min(1, ((x - w.xStart) * dx + (y - w.yStart) * dy) / l2),
      );
      return (
        Math.hypot(x - w.xStart - t * dx, y - w.yStart - t * dy) <
        w.thickness / 2
      );
    });
  }
  function run(
    f: Furniture,
    x: number,
    y: number,
    dx: number,
    dy: number,
    goal: number,
    ignoreChairs = false,
  ) {
    for (let d = 10; d <= goal; d += 10)
      if (blocked(f, x + dx * d, y + dy * d, ignoreChairs)) return d - 10;
    return goal;
  }
  for (const f of pieces) {
    if (f.elevation >= 100) continue;
    const c = Math.cos(f.angle),
      s = Math.sin(f.angle);
    if (f.generator === "bed") {
      const side = Math.min(
        ...[-1, 1].map((k) =>
          run(
            f,
            f.x + (k * c * f.width) / 2,
            f.y + (k * s * f.width) / 2,
            k * c,
            k * s,
            60,
          ),
        ),
      );
      if (side < 60) out.push(`${f.name}: bedside access samples under 60 cm.`);
    }
    if (
      ["cabinet", "counter", "fridge", "desk", "basin"].includes(
        f.generator ?? "",
      )
    ) {
      const goal =
        f.generator === "counter" ? 90 : f.generator === "desk" ? 80 : 70;
      const width = Math.min(
        ...[-0.32, 0, 0.32].map((k) =>
          run(
            f,
            f.x + c * f.width * k - (s * f.depth) / 2,
            f.y + s * f.width * k + (c * f.depth) / 2,
            -s,
            c,
            goal,
            true,
          ),
        ),
      );
      if (width < goal)
        out.push(
          `${f.name}: check front access against ${goal} cm design target.`,
        );
    }
    if (f.generator === "chair" && f.zoneId === "dining") {
      const t = pieces.find(
        (p) => p.generator === "table" && p.zoneId === "dining",
      );
      if (t) {
        const dx = f.x - t.x,
          dy = f.y - t.y,
          d = Math.hypot(dx, dy);
        if (
          d > 1 &&
          run(
            f,
            f.x + ((dx / d) * f.depth) / 2,
            f.y + ((dy / d) * f.depth) / 2,
            dx / d,
            dy / d,
            60,
            true,
          ) < 60
        )
          out.push(`${f.name}: chair pull-out sample below 60 cm.`);
      }
    }
  }
  for (const o of home.openings.filter(
    (o) => !o.hidden && /door/i.test(o.name) && o.elevation < 10,
  )) {
    const c = Math.cos(o.angle),
      s = Math.sin(o.angle);
    for (const a of o.sashes ?? []) {
      const hx = (a.xAxis - 0.5) * o.width,
        hy = (a.yAxis - 0.5) * o.depth;
      const hit = pieces.find(
        (f) =>
          f.elevation < o.height &&
          Array.from(
            { length: 9 },
            (_, i) => a.startAngle + ((a.endAngle - a.startAngle) * i) / 8,
          ).some((angle) =>
            [0.25, 0.5, 0.75, 1].some((t) => {
              const u = hx + Math.cos(angle) * a.width * o.width * t,
                v = hy + Math.sin(angle) * a.width * o.width * t;
              return inside(f, o.x + c * u - s * v, o.y + s * u + c * v);
            }),
          ),
      );
      if (hit) out.push(`${o.name}: approximate swing intersects ${hit.name}.`);
    }
  }
  return [
    ...new Set(out),
    "Clearance envelopes are advisory; door swings and fixture usability need manual review.",
  ];
}
