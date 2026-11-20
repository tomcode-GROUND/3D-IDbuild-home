import { sceneSchema } from "./sceneSchema";
import { strFromU8, strToU8, zipSync } from "fflate";
import { z } from "./validation.ts";
import { safeUnzip, parseProjectArchive, parseSh3d } from "./sh3d";
import { blankReview, parseProposal, reviewSchema } from "./planAnalysis";
import type { Proposal, Review } from "./planAnalysis";
import { checkPdfPage, planKind } from "./planFiles";
import type { Raster } from "./planFiles";
import type { HomeModel, ImportSource } from "./types";

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(10_000),
});
const metadata = z.object({
  version: z.literal(3),
  id: z.uuid(),
  title: z.string().min(1).max(200),
  createdAt: z.string(),
  updatedAt: z.string(),
  origin: z.enum(["plan", "sh3d"]),
  sourceName: z.string().min(1).max(255),
  page: z.number().int().min(1).max(50),
  pages: z.number().int().min(1).max(50),
  messages: z.array(messageSchema).max(24),
  review: reviewSchema,
  model: z.string().max(80),
});
export type Project = z.infer<typeof metadata> & {
  source: ImportSource;
  raster?: Raster;
  proposal?: Proposal;
  accepted?: { proposal: Proposal; review: Review; model: string };
  home?: HomeModel;
};
export function newProject(
  source: ImportSource,
  origin: Project["origin"],
): Project {
  const now = new Date().toISOString();
  return {
    version: 3,
    id: crypto.randomUUID(),
    title: source.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled plan",
    createdAt: now,
    updatedAt: now,
    origin,
    sourceName: source.name,
    page: 1,
    pages: 1,
    source,
    messages: [],
    review: { ...blankReview },
    model: "",
  };
}
export function copyProject(project: Project, suffix = ""): Project {
  const now = new Date().toISOString();
  return {
    ...project,
    id: crypto.randomUUID(),
    title: (project.title + suffix).slice(0, 200),
    createdAt: now,
    updatedAt: now,
  };
}
function acceptedTrace(value: unknown) {
  const accepted = z
    .object({
      proposal: z.unknown(),
      review: reviewSchema,
      model: z.string().max(80),
    })
    .parse(value);
  if (!accepted.review.approved)
    throw Error("The saved trace lacks user approval.");
  return {
    proposal: parseProposal(accepted.proposal),
    review: accepted.review,
    model: accepted.model,
  };
}
function fields(p: Project) {
  return metadata.parse(p);
}
function sceneFields(h: HomeModel) {
  return {
    name: h.name,
    version: h.version,
    wallHeight: h.wallHeight,
    furniture: h.furniture,
    openings: h.openings,
    walls: h.walls,
    rooms: h.rooms,
    backgroundScale: h.backgroundScale,
    background: h.background,
    warnings: h.warnings,
    lighting: h.lighting,
    zones: h.zones,
    viewpoints: h.viewpoints,
    licenses: h.licenses,
    validation: h.validation,
    sourceChecksum: h.sourceChecksum,
  };
}
function snapshot(p: Project): Project {
  const result: Project = {
    ...fields(p),
    source: { name: p.sourceName, bytes: p.source.bytes },
  };
  if (p.proposal) result.proposal = parseProposal(p.proposal);
  if (p.accepted) result.accepted = acceptedTrace(p.accepted);
  if (p.raster)
    result.raster = {
      bytes: p.raster.bytes,
      width: p.raster.width,
      height: p.raster.height,
    };
  if (p.home)
    result.home = {
      ...sceneSchema.parse(sceneFields(p.home)),
      assets: p.home.assets,
      backgroundImage: p.home.backgroundImage,
    };
  return result;
}
export function packProject(p: Project) {
  const document = snapshot(p);
  const entries: Record<string, Uint8Array> = {
    "source.bin": document.source.bytes,
  };
  let scene: ReturnType<typeof sceneFields> | undefined;
  if (document.home) {
    scene = sceneFields(document.home);
    if (document.home.backgroundImage)
      entries["background.bin"] = document.home.backgroundImage;
    Object.values(document.home.assets).forEach((bytes, i) => {
      entries["models/" + i] = bytes;
    });
  }
  if (document.raster) entries["preview.png"] = document.raster.bytes;
  entries["manifest.json"] = strToU8(
    JSON.stringify({
      ...fields(document),
      format: "idbuild-project",
      proposal: document.proposal,
      accepted: document.accepted,
      scene,
      assetNames: Object.keys(document.home?.assets ?? {}),
      raster: document.raster && {
        width: document.raster.width,
        height: document.raster.height,
      },
    }),
  );
  return zipSync(entries, { level: 3 });
}

export function openProject(source: ImportSource): Project {
  if (/\.sh3d$/i.test(source.name))
    return { ...newProject(source, "sh3d"), home: parseSh3d(source.bytes) };
  const entries = safeUnzip(source.bytes);
  if (!entries["manifest.json"]) throw Error("Project manifest is missing.");
  const d = JSON.parse(strFromU8(entries["manifest.json"]));
  if (d?.format !== "idbuild-project") {
    const legacy = parseProjectArchive(source.bytes);
    return { ...newProject(legacy.source, "sh3d"), home: legacy.home };
  }
  const meta = metadata.parse(d);
  if (!entries["source.bin"]) throw Error("Original project file is missing.");
  const p = copyProject({
    ...meta,
    source: { name: meta.sourceName, bytes: entries["source.bin"] },
  });
  if (p.origin === "plan") {
    const kind = planKind(p.source.bytes);
    checkPdfPage(p.pages, p.page);
    if (kind !== "pdf" && (p.pages !== 1 || p.page !== 1))
      throw Error("Invalid image page.");
  }
  if (d.raster) {
    const dimensions = z
      .object({
        width: z.number().int().min(1).max(2400),
        height: z.number().int().min(1).max(2400),
      })
      .parse(d.raster);
    const bytes = entries["preview.png"];
    if (!bytes || planKind(bytes) !== "png")
      throw Error("Plan preview is missing or invalid.");
    p.raster = { ...dimensions, bytes };
  }
  if (d.proposal) p.proposal = parseProposal(d.proposal);
  if (d.accepted) p.accepted = acceptedTrace(d.accepted);
  if (d.scene) {
    const assets: Record<string, Uint8Array> = Object.create(null);
    z.array(z.string().max(500))
      .max(1500)
      .parse(d.assetNames)
      .forEach((name, i) => {
        const bytes = entries["models/" + i];
        if (!bytes) throw Error("Project model is missing.");
        assets[name] = bytes;
      });
    p.home = {
      ...sceneSchema.parse(d.scene),
      assets,
      backgroundImage: entries["background.bin"],
    };
  }
  return p;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("idbuild-home", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("Close the other studio tabs and retry."));
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("projects", mode);
      const request = action(tx.objectStore("projects"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error);
      tx.onerror = () => reject(tx.error ?? request.error);
    });
  } finally {
    db.close();
  }
}
export const saveLocal = (p: Project) =>
  transact("readwrite", (store) => store.put(snapshot(p)));
export const loadLocal = (id: string): Promise<Project | undefined> =>
  transact("readonly", (store) => store.get(id));
export const listLocal = (): Promise<Project[]> =>
  transact("readonly", (store) => store.getAll());
