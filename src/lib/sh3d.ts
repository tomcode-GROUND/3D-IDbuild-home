import { sceneSchema } from "./sceneSchema.ts";
import { openingsForWall } from "./geometry.ts";
import clipping from "polygon-clipping";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
  Furniture,
  HomeModel,
  ImportSource,
  LightingSettings,
  Opening,
  ProjectManifest,
  Room,
  Wall,
} from "./types.ts";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: true,
  trimValues: true,
  processEntities: false,
});

const defaults: LightingSettings = {
  sunAzimuth: 145,
  sunElevation: 38,
  ambient: 0.72,
  daylight: 2.8,
};

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const numberValue = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && Number.isFinite(Number(value))
      ? Number(value)
      : fallback;

const booleanValue = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean"
    ? value
    : value === "true"
      ? true
      : value === "false"
        ? false
        : fallback;

const textValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

function parseFurniture(item: Record<string, unknown>): Furniture {
  return {
    kind: "furniture",
    id: textValue(item.id),
    name: textValue(item.name, "Furniture"),
    x: numberValue(item.x),
    y: numberValue(item.y),
    elevation: numberValue(item.elevation),
    angle: numberValue(item.angle),
    width: numberValue(item.width, 100),
    depth: numberValue(item.depth, 100),
    height: numberValue(item.height, 100),
    model: textValue(item.model) || undefined,
    modelMirrored: booleanValue(item.modelMirrored),
    movable: booleanValue(item.movable, true),
  };
}

function parseOpening(item: Record<string, unknown>): Opening {
  return {
    kind: "opening",
    id: textValue(item.id),
    name: textValue(item.name, "Opening"),
    x: numberValue(item.x),
    y: numberValue(item.y),
    elevation: numberValue(item.elevation),
    angle: numberValue(item.angle),
    width: numberValue(item.width, 90),
    depth: numberValue(item.depth, 10),
    height: numberValue(item.height, 210),
    model: textValue(item.model) || undefined,
    modelMirrored: booleanValue(item.modelMirrored),
    boundToWall: booleanValue(item.boundToWall, true),
    cutOutShape: textValue(item.cutOutShape) || undefined,
    wallThickness: numberValue(item.wallThickness, 1),
    wallDistance: numberValue(item.wallDistance),
    sashes: asArray(item.sash as Record<string, unknown>[]).map((s) => ({
      xAxis: numberValue(s.xAxis),
      yAxis: numberValue(s.yAxis),
      width: numberValue(s.width),
      startAngle: numberValue(s.startAngle),
      endAngle: numberValue(s.endAngle),
    })),
  };
}

function parseWall(
  item: Record<string, unknown>,
  index: number,
  wallHeight: number,
): Wall {
  const xStart = numberValue(item.xStart);
  const yStart = numberValue(item.yStart);
  const xEnd = numberValue(item.xEnd);
  const yEnd = numberValue(item.yEnd);
  return {
    kind: "wall",
    id: textValue(item.id, `wall-${index + 1}`),
    name: `Wall ${index + 1}`,
    x: (xStart + xEnd) / 2,
    y: (yStart + yEnd) / 2,
    elevation: 0,
    angle: Math.atan2(yEnd - yStart, xEnd - xStart),
    xStart,
    yStart,
    xEnd,
    yEnd,
    height: numberValue(item.height, wallHeight),
    thickness: numberValue(item.thickness, 7.5),
  };
}

function parseRoom(item: Record<string, unknown>, index: number): Room {
  const points = asArray(
    item.point as Record<string, unknown> | Record<string, unknown>[],
  ).map((point) => ({
    x: numberValue(point.x),
    y: numberValue(point.y),
  }));
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    kind: "room",
    id: textValue(item.id, `room-${index + 1}`),
    name: textValue(item.name, `Unnamed room ${index + 1}`),
    x: points.length ? center.x / points.length : 0,
    y: points.length ? center.y / points.length : 0,
    elevation: 0,
    angle: 0,
    points,
    ceilingVisible: booleanValue(item.ceilingVisible, true),
    ceilingFlat: booleanValue(item.ceilingFlat, true),
  };
}

function hasOverlappingWalls(walls: Wall[]): boolean {
  const epsilon = 0.001;
  const collinear = (a: Wall, b: Wall) => {
    const adx = a.xEnd - a.xStart;
    const ady = a.yEnd - a.yStart;
    const crossStart =
      adx * (b.yStart - a.yStart) - ady * (b.xStart - a.xStart);
    const crossEnd = adx * (b.yEnd - a.yStart) - ady * (b.xEnd - a.xStart);
    return Math.abs(crossStart) < epsilon && Math.abs(crossEnd) < epsilon;
  };
  for (let index = 0; index < walls.length; index += 1) {
    for (let other = index + 1; other < walls.length; other += 1) {
      const a = walls[index];
      const b = walls[other];
      if (!collinear(a, b)) continue;
      const dx = a.xEnd - a.xStart;
      const dy = a.yEnd - a.yStart;
      const lengthSq = dx * dx + dy * dy;
      if (!lengthSq) continue;
      const project = (x: number, y: number) =>
        ((x - a.xStart) * dx + (y - a.yStart) * dy) / lengthSq;
      const aMin = 0;
      const aMax = 1;
      const bMin = Math.min(
        project(b.xStart, b.yStart),
        project(b.xEnd, b.yEnd),
      );
      const bMax = Math.max(
        project(b.xStart, b.yStart),
        project(b.xEnd, b.yEnd),
      );
      if (Math.max(aMin, bMin) < Math.min(aMax, bMax) - epsilon) return true;
    }
  }
  return false;
}

export function parseHomeXml(
  xml: string,
  assets: Record<string, Uint8Array> = {},
): HomeModel {
  if (
    xml.length > 20_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new Error("Invalid or unsupported XML document.");
  const parsed = xmlParser.parse(xml) as { home?: Record<string, unknown> };
  const home = typeof parsed.home === "object" ? parsed.home : {};
  if (parsed.home === undefined)
    throw new Error(
      "Home.xml does not contain a Sweet Home 3D <home> element.",
    );

  const wallHeight = numberValue(home.wallHeight, 250);
  const furniture = asArray(
    home.pieceOfFurniture as
      Record<string, unknown> | Record<string, unknown>[],
  ).map(parseFurniture);
  const openings = asArray(
    home.doorOrWindow as Record<string, unknown> | Record<string, unknown>[],
  ).map(parseOpening);
  const walls = asArray(
    home.wall as Record<string, unknown> | Record<string, unknown>[],
  ).map((wall, index) => parseWall(wall, index, wallHeight));
  const rooms = asArray(
    home.room as Record<string, unknown> | Record<string, unknown>[],
  ).map(parseRoom);
  const background = home.backgroundImage as
    Record<string, unknown> | undefined;
  const warnings: string[] = [];
  if (
    walls.length > 1200 ||
    rooms.length > 250 ||
    openings.length > 1200 ||
    furniture.length > 2000 ||
    rooms.some((room) => room.points.length > 250)
  )
    throw new Error("This floor plan exceeds the editor’s geometry limits.");
  if (asArray(home.furnitureGroup as unknown[]).length)
    warnings.push("Furniture groups are unsupported and require review.");
  if (walls.some((w) => w.height !== wallHeight))
    warnings.push("Mixed wall heights preserved. Review vertical dimensions.");
  if (rooms.some((r) => r.name.startsWith("Unnamed")))
    warnings.push(
      "Source room names are missing; design zones identify intended use separately.",
    );
  if (rooms.some((r) => r.points.length < 3 || !roomArea(r)))
    warnings.push("Invalid room polygon detected.");
  if (asArray(home.wall as Record<string, unknown>[]).some((w) => w.arcExtent))
    warnings.push(
      "Curved walls are unsupported; straight chords shown provisionally.",
    );
  if (
    Object.keys(assets).some((p) => p.endsWith(".obj")) &&
    !Object.keys(assets).some((p) => p.endsWith(".mtl"))
  )
    warnings.push(
      "OBJ assets have no MTL files. Fallback colours and glass materials are used.",
    );

  if (asArray(home.level as unknown[]).length > 0)
    warnings.push(
      "Multiple levels are present. This editor currently renders one level at a time.",
    );
  if (hasOverlappingWalls(walls))
    warnings.push(
      "Coincident wall runs detected. They are merged for preview to avoid double surfaces.",
    );
  const unmatched = openings.filter(
    (o) => !walls.some((w) => openingsForWall(w, [o]).length),
  );
  if (unmatched.length)
    warnings.push(
      "Unmatched openings: " +
        unmatched.map((o) => o.name).join(", ") +
        ". Verify placement before editing walls.",
    );
  if (openings.some((opening) => !opening.boundToWall)) {
    warnings.push(
      "Some openings have a stale wall-binding flag. Their actual intersection is checked during rendering.",
    );
  }
  if (furniture.some((piece) => piece.model && !assets[piece.model]))
    warnings.push("One or more furniture model assets are missing.");
  if (openings.some((piece) => piece.model && !assets[piece.model]))
    warnings.push("One or more opening model assets are missing.");

  for (let i = 0; i < rooms.length; i++)
    for (const other of rooms.slice(i + 1)) {
      try {
        const poly = clipping.intersection(
          [rooms[i].points.map((p) => [p.x, p.y] as [number, number])],
          [other.points.map((p) => [p.x, p.y] as [number, number])],
        );
        const a = poly.reduce(
          (sum, p) =>
            sum +
            Math.abs(
              p[0].reduce((v, a, j) => {
                const b = p[0][(j + 1) % p[0].length];
                return v + a[0] * b[1] - b[0] * a[1];
              }, 0) / 2,
            ),
          0,
        );
        if (a > 1)
          warnings.push(
            "Overlapping source floors: " + rooms[i].name + " / " + other.name,
          );
      } catch {
        warnings.push("Room polygon topology needs review.");
      }
    }
  const imagePath = background ? textValue(background.image) : "";
  return {
    name: textValue(home.name, "Untitled home"),
    version: textValue(home.version, "unknown"),
    wallHeight,
    furniture,
    openings,
    walls,
    rooms,
    backgroundImage: imagePath ? assets[imagePath] : undefined,
    backgroundScale: background
      ? numberValue(background.scaleDistance)
      : undefined,
    background: background
      ? {
          scale:
            numberValue(background.scaleDistance) /
            (Math.hypot(
              numberValue(background.scaleDistanceXEnd) -
                numberValue(background.scaleDistanceXStart),
              numberValue(background.scaleDistanceYEnd) -
                numberValue(background.scaleDistanceYStart),
            ) || 1),
          xOrigin: numberValue(background.xOrigin),
          yOrigin: numberValue(background.yOrigin),
        }
      : undefined,
    zones: [],
    viewpoints: [],
    licenses: [],
    validation: "provisional",
    assets,
    warnings,
    lighting: { ...defaults },
  };
}

export function parseSh3d(bytes: Uint8Array): HomeModel {
  let entries: Record<string, Uint8Array>;
  try {
    entries = safeUnzip(bytes);
  } catch {
    throw new Error("The selected file is not a valid ZIP-based SH3D archive.");
  }
  const homeXml = entries["Home.xml"];
  if (!homeXml)
    throw new Error(
      "This archive has no Home.xml entry. It is not supported by this editor.",
    );
  return parseHomeXml(strFromU8(homeXml), entries);
}

export function createProjectArchive(
  source: ImportSource,
  home: HomeModel,
): Uint8Array {
  const manifest: ProjectManifest = {
    format: "fdwz-3d-editor",
    version: 2,
    sourceChecksum: home.sourceChecksum,
    assetPaths: Object.keys(home.assets).filter((p) => p.startsWith("design/")),
    sourceName: source.name,
    savedAt: new Date().toISOString(),
    state: {
      furniture: home.furniture,
      openings: home.openings,
      walls: home.walls,
      rooms: home.rooms,
      lighting: home.lighting,
      zones: home.zones,
      viewpoints: home.viewpoints,
      licenses: home.licenses,
      validation: home.validation,
      warnings: home.warnings,
    },
  };
  return zipSync(
    {
      "source.sh3d": source.bytes,
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      ...Object.fromEntries(
        Object.entries(home.assets)
          .filter(([p]) => p.startsWith("design/"))
          .map(([p, v]) => ["assets/" + p, v]),
      ),
    },
    { level: 6 },
  );
}

export function parseProjectArchive(bytes: Uint8Array): {
  home: HomeModel;
  source: ImportSource;
} {
  let entries: Record<string, Uint8Array>;
  try {
    entries = safeUnzip(bytes);
  } catch {
    throw new Error("The selected editor project is not a valid archive.");
  }
  if (!entries["source.sh3d"] || !entries["manifest.json"])
    throw new Error(
      "This project archive is missing its source file or edit manifest.",
    );
  let manifest: ProjectManifest;
  try {
    manifest = JSON.parse(
      strFromU8(entries["manifest.json"]),
    ) as ProjectManifest;
  } catch {
    throw new Error("The editor-project manifest could not be read.");
  }
  if (
    manifest.format !== "fdwz-3d-editor" ||
    ![1, 2].includes(manifest.version)
  )
    throw new Error("This editor-project format is not supported.");
  const home = parseSh3d(entries["source.sh3d"]);
  const state = sceneSchema.parse({
    ...home,
    ...manifest.state,
    // Older archives supplied lighting but could omit fields added later.
    lighting: { ...home.lighting, ...manifest.state?.lighting },
    sourceChecksum: manifest.sourceChecksum,
  });
  Object.assign(home, state);
  for (const [path, value] of Object.entries(entries))
    if (path.startsWith("assets/")) home.assets[path.slice(7)] = value;
  return {
    home,
    source: {
      name: manifest.sourceName || "source.sh3d",
      bytes: entries["source.sh3d"],
    },
  };
}

export function roomArea(room: Room): number {
  const { points } = room;
  if (points.length < 3) return 0;
  return (
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0) / 2,
    ) / 10000
  );
}

export function totalArea(rooms: Room[]): number {
  return rooms.reduce((sum, room) => sum + roomArea(room), 0);
}

export function safeUnzip(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength < 22) throw Error("Invalid archive.");
  if (bytes.byteLength > 100_000_000)
    throw new Error("Archive exceeds the 100 MB limit.");
  let total = 0;
  const sizes = new Map<string, number>();
  const entries = unzipSync(bytes, {
    filter: (file) => {
      const segments = file.name.replace(/\/$/, "").split("/");
      total += file.originalSize;
      if (
        sizes.size >= 2000 ||
        total > 150_000_000 ||
        file.originalSize > 50_000_000 ||
        sizes.has(file.name) ||
        /[\\:]/.test(file.name) ||
        Array.from(file.name).some(
          (character) => character.charCodeAt(0) < 32,
        ) ||
        segments.some(
          (part) =>
            !part ||
            [".", "..", "__proto__", "constructor", "prototype"].includes(part),
        )
      )
        throw new Error("Unsafe or oversized archive.");
      sizes.set(file.name, file.originalSize);
      return true;
    },
  });
  const result: Record<string, Uint8Array> = Object.create(null);
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.byteLength !== sizes.get(name))
      throw Error("Invalid archive entry size.");
    result[name] = entry;
  }
  return result;
}
