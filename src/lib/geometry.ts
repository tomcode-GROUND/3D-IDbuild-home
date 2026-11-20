import type { Opening, Wall } from "./types.ts";

export interface RenderWall extends Wall {
  sourceIds: string[];
}

const epsilon = 0.001;

const wallVector = (wall: Wall) => ({
  x: wall.xEnd - wall.xStart,
  y: wall.yEnd - wall.yStart,
});

function canonicalLine(wall: Wall) {
  const vector = wallVector(wall);
  const length = Math.hypot(vector.x, vector.y);
  if (!length) return null;
  let dx = vector.x / length;
  let dy = vector.y / length;
  if (dx < -epsilon || (Math.abs(dx) < epsilon && dy < 0)) {
    dx *= -1;
    dy *= -1;
  }
  const normalX = -dy;
  const normalY = dx;
  const distance = normalX * wall.xStart + normalY * wall.yStart;
  return { dx, dy, normalX, normalY, distance };
}

function intervalOnLine(
  wall: Wall,
  line: NonNullable<ReturnType<typeof canonicalLine>>,
) {
  const first = line.dx * wall.xStart + line.dy * wall.yStart;
  const second = line.dx * wall.xEnd + line.dy * wall.yEnd;
  return { min: Math.min(first, second), max: Math.max(first, second) };
}

/** Merges only truly coincident, same-dimension source walls for rendering. Original wall IDs stay attached. */
export function mergeCoincidentWalls(walls: Wall[]): RenderWall[] {
  const buckets: Array<{
    line: NonNullable<ReturnType<typeof canonicalLine>>;
    walls: Wall[];
  }> = [];
  for (const wall of walls) {
    const line = canonicalLine(wall);
    if (!line) continue;
    const bucket = buckets.find(
      (candidate) =>
        Math.abs(candidate.line.normalX - line.normalX) < epsilon &&
        Math.abs(candidate.line.normalY - line.normalY) < epsilon &&
        Math.abs(candidate.line.distance - line.distance) < epsilon &&
        Math.abs(candidate.walls[0].thickness - wall.thickness) < epsilon &&
        Math.abs(candidate.walls[0].height - wall.height) < epsilon,
    );
    if (bucket) bucket.walls.push(wall);
    else buckets.push({ line, walls: [wall] });
  }

  return buckets.flatMap(({ line, walls: sourceWalls }) => {
    const intervals = sourceWalls
      .map((wall) => ({ wall, ...intervalOnLine(wall, line) }))
      .sort((a, b) => a.min - b.min);
    const merged: RenderWall[] = [];
    let active = intervals[0];
    let ids = active ? [active.wall.id] : [];
    for (let index = 1; index < intervals.length; index += 1) {
      const next = intervals[index];
      if (active && next.min <= active.max + epsilon) {
        active.max = Math.max(active.max, next.max);
        ids.push(next.wall.id);
      } else if (active) {
        merged.push(
          renderWallFromInterval(
            active.wall,
            line,
            active.min,
            active.max,
            ids,
          ),
        );
        active = next;
        ids = [next.wall.id];
      }
    }
    if (active)
      merged.push(
        renderWallFromInterval(active.wall, line, active.min, active.max, ids),
      );
    return merged;
  });
}

function renderWallFromInterval(
  source: Wall,
  line: NonNullable<ReturnType<typeof canonicalLine>>,
  min: number,
  max: number,
  sourceIds: string[],
): RenderWall {
  return {
    ...source,
    id: `render-${sourceIds.join("-")}`,
    name:
      sourceIds.length > 1 ? `Merged wall (${sourceIds.length})` : source.name,
    xStart: line.dx * min + line.normalX * line.distance,
    yStart: line.dy * min + line.normalY * line.distance,
    xEnd: line.dx * max + line.normalX * line.distance,
    yEnd: line.dy * max + line.normalY * line.distance,
    sourceIds,
  };
}

export interface WallOpening extends Opening {
  start: number;
  end: number;
}

/** Finds rectangular door/window cut-outs against the physical wall line. */
export function openingsForWall(
  wall: Wall,
  openings: Opening[],
): WallOpening[] {
  const dx = wall.xEnd - wall.xStart;
  const dy = wall.yEnd - wall.yStart;
  const length = Math.hypot(dx, dy);
  if (!length) return [];
  const ux = dx / length;
  const uy = dy / length;
  const normalX = -uy;
  const normalY = ux;
  return openings
    .map((opening) => {
      const offset =
        ((opening.wallDistance ?? 0) + (opening.wallThickness ?? 1) / 2 - 0.5) *
        opening.depth;
      const cx = opening.x - Math.sin(opening.angle) * offset;
      const cy = opening.y + Math.cos(opening.angle) * offset;
      const alignment = Math.abs(
        Math.cos(opening.angle) * ux + Math.sin(opening.angle) * uy,
      );
      const relativeX = cx - wall.xStart;
      const relativeY = cy - wall.yStart;
      const center = relativeX * ux + relativeY * uy;
      const perpendicular = Math.abs(relativeX * normalX + relativeY * normalY);
      const halfWidth = opening.width / 2;
      const intersects =
        alignment > 0.98 &&
        perpendicular <=
          wall.thickness / 2 +
            Math.max(1, (opening.wallThickness ?? 1) * opening.depth) / 2 +
            0.5 &&
        center + halfWidth > 0 &&
        center - halfWidth < length;
      if (!intersects) return undefined;
      return {
        ...opening,
        start: Math.max(0, center - halfWidth),
        end: Math.min(length, center + halfWidth),
      };
    })
    .filter((opening): opening is WallOpening => Boolean(opening))
    .sort((a, b) => a.start - b.start);
}
