import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SceneViewer, type SceneViewerHandle } from "./components/SceneViewer";
import { PlanView } from "./components/PlanView";
import { roomArea } from "./lib/sh3d";
import { clearanceWarnings } from "./lib/design";
import type {
  DocumentState,
  EntityKind,
  Furniture,
  Generator,
  HomeModel,
  Selection,
  Finish,
} from "./lib/types";
import "./App.css";
const snapshot = (h: HomeModel): DocumentState =>
  structuredClone({
    furniture: h.furniture,
    openings: h.openings,
    walls: h.walls,
    rooms: h.rooms,
    lighting: h.lighting,
    zones: h.zones,
    viewpoints: h.viewpoints,
    licenses: h.licenses,
    validation: h.validation,
    warnings: h.warnings,
  });
type State = {
  home: HomeModel | null;
  past: DocumentState[];
  future: DocumentState[];
};
type Action =
  | { type: "load"; home: HomeModel }
  | { type: "edit"; edit: (h: HomeModel) => HomeModel }
  | { type: "gesture"; home: HomeModel; base?: DocumentState }
  | { type: "undo" | "redo" };
function reducer(s: State, a: Action): State {
  if (a.type === "load") return { home: a.home, past: [], future: [] };
  if (a.type === "gesture")
    return {
      home: a.home,
      past: a.base ? [...s.past, a.base].slice(-80) : s.past,
      future: a.base ? [] : s.future,
    };
  if (!s.home) return s;
  if (a.type === "edit")
    return {
      home: a.edit(s.home),
      past: [...s.past, snapshot(s.home)].slice(-80),
      future: [],
    };
  const from = a.type === "undo" ? s.past : s.future;
  if (!from.length) return s;
  const value = from[from.length - 1],
    current = snapshot(s.home);
  return a.type === "undo"
    ? {
        home: { ...s.home, ...value },
        past: s.past.slice(0, -1),
        future: [...s.future, current],
      }
    : {
        home: { ...s.home, ...value },
        past: [...s.past, current],
        future: s.future.slice(0, -1),
      };
}
const download = (blob: Blob, name: string) => {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 3000);
};
export default function App({
  initialHome,
  title,
  onChange,
  onSave,
  onBack,
}: {
  initialHome: HomeModel;
  title: string;
  onChange: (home: HomeModel) => void;
  onSave: (home: HomeModel) => void;
  onBack: (home: HomeModel) => void;
}) {
  const [state, dispatch] = useReducer(reducer, {
      home: initialHome,
      past: [],
      future: [],
    }),
    home = state.home;
  const [selection, setSelection] = useState<Selection | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState(
      "Editable scene ready · geometry remains provisional",
    ),
    [activeView, setActiveView] = useState("3d"),
    [walkMode, setWalk] = useState(false),
    [shellOnly, setShell] = useState(false),
    [ceilings, setCeilings] = useState(false),
    [architecture, setArchitecture] = useState(false),
    [transformMode, setTransform] = useState<"translate" | "rotate">(
      "translate",
    ),
    [snap, setSnap] = useState(10),
    [filter, setFilter] = useState<EntityKind>("furniture");
  const viewer = useRef<SceneViewerHandle>(null);
  const [assetWarnings, setAssetWarnings] = useState<string[]>([]);
  const mutate = (edit: (h: HomeModel) => HomeModel) =>
    dispatch({ type: "edit", edit });
  useEffect(() => {
    if (home) onChange(home);
  }, [home, onChange]);
  const collection = home
    ? filter === "furniture"
      ? home.furniture
      : filter === "wall"
        ? home.walls
        : filter === "opening"
          ? home.openings
          : home.rooms
    : [];
  const selected = useMemo(() => {
    if (!home || !selection) return null;
    return (
      (selection.kind === "furniture"
        ? home.furniture
        : selection.kind === "wall"
          ? home.walls
          : selection.kind === "opening"
            ? home.openings
            : home.rooms
      ).find((x) => x.id === selection.id) ?? null
    );
  }, [home, selection]);
  const warnings = useMemo(
    () =>
      home
        ? [...home.warnings, ...assetWarnings, ...clearanceWarnings(home)]
        : [],
    [home, assetWarnings],
  );
  function patch(p: Record<string, unknown>) {
    if (!selection) return;
    mutate((h) => {
      const key =
        selection.kind === "furniture"
          ? "furniture"
          : selection.kind === "opening"
            ? "openings"
            : selection.kind === "wall"
              ? "walls"
              : "rooms";
      return {
        ...h,
        [key]: h[key].map((e) => (e.id === selection.id ? { ...e, ...p } : e)),
        validation: selection.kind === "furniture" ? h.validation : "changed",
      };
    });
  }
  const dragBase = useRef<DocumentState | null>(null);
  function transform(id: string, p: Partial<Furniture>) {
    mutate((h) => ({
      ...h,
      furniture: h.furniture.map((f) => (f.id === id ? { ...f, ...p } : f)),
    }));
  }
  function move(id: string, x: number, y: number, commit: boolean) {
    if (!home) return;
    if (!dragBase.current) dragBase.current = snapshot(home);
    const next = {
      ...home,
      furniture: home.furniture.map((f) => (f.id === id ? { ...f, x, y } : f)),
    };
    dispatch({
      type: "gesture",
      home: next,
      base: commit ? dragBase.current : undefined,
    });
    if (commit) dragBase.current = null;
  }
  async function exportGlb() {
    try {
      if (!viewer.current) throw Error("Open the 3D view before exporting GLB.");
      const b = await viewer.current.exportGlb();
      download(b, "IDbuild-scene.glb");
      setStatus(
        "GLB exported · set HDR lighting and post effects separately in other renderers.",
      );
    } catch (e) {
      setError(String(e));
    }
  }
  function save() {
    if (home) onSave(home);
  }
  function capture() {
    const u = viewer.current?.capturePng();
    if (u)
      fetch(u)
        .then((r) => r.blob())
        .then((b) => download(b, "IDbuild-preview.png"));
  }
  function add(kind: Generator) {
    if (!home) return;
    const f: Furniture = {
      id: crypto.randomUUID(),
      kind: "furniture",
      name: "New " + kind,
      x: home.walls[0]?.xStart ?? 0,
      y: home.walls[0]?.yStart ?? 0,
      width: kind === "bed" ? 150 : kind === "table" ? 137 : 100,
      depth: kind === "bed" ? 200 : kind === "table" ? 137 : 50,
      height: kind === "bed" ? 105 : 75,
      elevation: 0,
      angle: 0,
      modelMirrored: false,
      movable: true,
      generator: kind,
      finish: kind === "bed" ? "fabric" : "walnut",
      assetNote: "Parametric studio model",
    };
    mutate((h) => ({ ...h, furniture: [...h.furniture, f] }));
    setSelection({ kind: "furniture", id: f.id });
  }
  if (!home)
    return (
      <main className="loading-shell">
        <div className="loading-mark">ID</div>
        <h1>3D IDbuild home</h1>
        <p>{status}</p>
        {error && <p>{error}</p>}
      </main>
    );
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">ID</span>
          <div>
            <strong>3D IDbuild home</strong>
            <span>A home, thoughtfully composed.</span>
          </div>
        </div>
        <div className="project-title">
          <span>EDITABLE MODEL</span>
          <strong>{title}</strong>
          <em>Design study · provisional architecture</em>
        </div>
        <div className="top-actions">
          <button className="button quiet" onClick={() => onBack(home)}>
            Studio
          </button>
          <button className="button quiet" onClick={save}>
            Download project
          </button>
          <button className="button primary" onClick={exportGlb}>
            Export GLB ↗
          </button>
        </div>
      </header>
      <section className="workspace">
        <aside className="left-panel">
          <div className="section-label">THE PROJECT</div>
          <button
            className="overview"
            onClick={() => {
              viewer.current?.frameHome();
              setCeilings(false);
              setWalk(false);
            }}
          >
            ⌖ Model overview
          </button>
          <button
            className="overview"
            onClick={() => {
              const v = viewer.current?.currentView();
              if (v)
                mutate((h) => ({
                  ...h,
                  viewpoints: [
                    ...h.viewpoints,
                    {
                      ...v,
                      name:
                        "Saved view " +
                        (h.viewpoints.filter((p) =>
                          p.name.startsWith("Saved view"),
                        ).length +
                          1),
                    },
                  ],
                }));
            }}
          >
            ＋ Save this viewpoint
          </button>
          <div className="zone-list">
            {home.viewpoints.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  viewer.current?.view(v);
                  setActiveView("3d");
                  setCeilings(true);
                }}
              >
                {v.name}
                <span>↗</span>
              </button>
            ))}
          </div>
          <div className="section-label">SCENE COLLECTION</div>
          <nav className="inventory">
            {(["furniture", "opening", "wall", "room"] as EntityKind[]).map(
              (k) => (
                <button
                  className={filter === k ? "active" : ""}
                  key={k}
                  onClick={() => setFilter(k)}
                >
                  {k === "opening"
                    ? "Openings"
                    : k === "room"
                      ? "Source rooms"
                      : k === "wall"
                        ? "Walls"
                        : "Furniture"}
                  <b>
                    {
                      (k === "furniture"
                        ? home.furniture
                        : k === "opening"
                          ? home.openings
                          : k === "wall"
                            ? home.walls
                            : home.rooms
                      ).length
                    }
                  </b>
                </button>
              ),
            )}
          </nav>
          <div className="entity-list">
            {collection.map((e) => (
              <button
                className={selection?.id === e.id ? "selected" : ""}
                key={e.id}
                onClick={() => setSelection({ kind: filter, id: e.id })}
              >
                {e.hidden ? "◌" : "·"} {e.name}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Add furniture</span>
            <select value="" onChange={(e) => add(e.target.value as Generator)}>
              <option value="">Choose a piece…</option>
              {[
                "bed",
                "cabinet",
                "desk",
                "table",
                "chair",
                "shelf",
                "plant",
                "lamp",
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <div className="source-note">
            <strong>Original source preserved</strong>
            <span>{home.sourceChecksum?.slice(0, 16)}…</span>
            <small>Local project · editable archive v3</small>
          </div>
        </aside>
        <section className="main-stage">
          <div className="stage-toolbar">
            <div className="segmented">
              <button
                className={activeView === "3d" ? "active" : ""}
                onClick={() => setActiveView("3d")}
              >
                3D interior
              </button>
              <button
                className={activeView === "plan" ? "active" : ""}
                onClick={() => setActiveView("plan")}
              >
                Floor plan
              </button>
            </div>
            <div className="stage-options">
              <label>
                <input
                  type="checkbox"
                  checked={shellOnly}
                  onChange={(e) => setShell(e.target.checked)}
                />
                Shell only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={ceilings}
                  onChange={(e) => setCeilings(e.target.checked)}
                />
                Ceilings
              </label>
              <button onClick={() => setWalk((v) => !v)}>
                {walkMode ? "Orbit" : "Walk"}
              </button>
            </div>
          </div>
          <div
            className={`view-stack ${activeView === "plan" ? "show-plan" : ""}`}
          >
            <section className="three-view">
              <SceneViewer
                ref={viewer}
                home={home}
                selection={selection}
                onSelect={setSelection}
                walkMode={walkMode}
                shellOnly={shellOnly}
                ceilings={ceilings}
                transformMode={transformMode}
                snap={snap}
                onTransform={transform}
                onAssetWarning={(m) =>
                  setAssetWarnings((w) => (w.includes(m) ? w : [...w, m]))
                }
              />
            </section>
            <section className="plan-view">
              <PlanView
                home={home}
                selection={selection}
                onSelect={setSelection}
                onFurnitureMove={move}
                snap={snap}
              />
            </section>
            <select
              className="room-jump"
              aria-label="Room viewpoint"
              value=""
              onChange={(e) => {
                const v = home.viewpoints.find((v) => v.id === e.target.value);
                if (v) {
                  viewer.current?.view(v);
                  setActiveView("3d");
                  setCeilings(true);
                } else {
                  viewer.current?.frameHome();
                  setCeilings(false);
                }
              }}
            >
              <option value="">Room viewpoints</option>
              <option value="overview">Model overview</option>
              {home.viewpoints.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <div className="canvas-tools">
              <button
                title="Undo"
                disabled={!state.past.length}
                onClick={() => dispatch({ type: "undo" })}
              >
                ↶
              </button>
              <button
                title="Redo"
                disabled={!state.future.length}
                onClick={() => dispatch({ type: "redo" })}
              >
                ↷
              </button>
              <span />
              <button
                className={transformMode === "translate" ? "active" : ""}
                onClick={() => setTransform("translate")}
              >
                Move
              </button>
              <button
                className={transformMode === "rotate" ? "active" : ""}
                onClick={() => setTransform("rotate")}
              >
                Rotate
              </button>
              <select
                aria-label="Grid snap"
                value={snap}
                onChange={(e) => setSnap(+e.target.value)}
              >
                <option value="0">Free</option>
                <option value="5">5 cm</option>
                <option value="10">10 cm</option>
                <option value="25">25 cm</option>
              </select>
              <button onClick={capture}>PNG ↗</button>
            </div>
          </div>
          <footer className="stage-footer">
            <span>{status}</span>
            <span>
              cm ·{" "}
              {home.validation === "changed"
                ? "Geometry changed · areas unverified"
                : "Design preview"}
            </span>
          </footer>
        </section>
        <aside className="right-panel">
          <div className="section-label">DESIGN DETAILS</div>
          {selected && selection ? (
            <>
              <PropertyPanel
                key={selected.id}
                entity={selected}
                kind={selection.kind}
                onChange={patch}
                architecture={architecture}
              />
              {selection.kind === "furniture" && (
                <div className="piece-actions">
                  <button onClick={() => patch({ hidden: !selected.hidden })}>
                    {selected.hidden ? "Show" : "Hide"}
                  </button>
                  <button
                    onClick={() => {
                      const f = selected as Furniture;
                      const id = crypto.randomUUID();
                      mutate((h) => ({
                        ...h,
                        furniture: [
                          ...h.furniture,
                          { ...f, id, x: f.x + 30, y: f.y + 30 },
                        ],
                      }));
                      setSelection({ kind: "furniture", id });
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      mutate((h) => ({
                        ...h,
                        furniture: h.furniture.filter(
                          (f) => f.id !== selected.id,
                        ),
                      }));
                      setSelection(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-properties">
              <span>THE MATERIAL PALETTE</span>
              <div className="swatches">
                <i />
                <i />
                <i />
                <i />
              </div>
              <strong>
                Quiet materials.
                <br />
                Generous comfort.
              </strong>
              <p>
                Ivory linen, walnut, honed stone and brushed bronze. Select a
                piece to make it yours.
              </p>
            </div>
          )}
          <label className="architecture-toggle">
            <input
              type="checkbox"
              checked={architecture}
              onChange={(e) => setArchitecture(e.target.checked)}
            />
            Enable Architecture mode
          </label>
          <div className="lighting-card">
            <div className="card-heading">
              <strong>Atmosphere</strong>
              <small>Light changes how home feels.</small>
            </div>
            <div className="segmented">
              {(["day", "evening"] as const).map((p) => (
                <button
                  key={p}
                  className={home.lighting.preset === p ? "active" : ""}
                  onClick={() =>
                    mutate((h) => ({
                      ...h,
                      lighting: {
                        ...h.lighting,
                        preset: p,
                        daylight: p === "day" ? 3 : 0.2,
                        ambient: p === "day" ? 0.55 : 0.3,
                      },
                    }))
                  }
                >
                  {p === "day" ? "Daylight" : "Evening"}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Preview quality</span>
              <select
                value={home.lighting.quality ?? "balanced"}
                onChange={(e) =>
                  mutate((h) => ({
                    ...h,
                    lighting: {
                      ...h.lighting,
                      quality: e.target.value as "low" | "balanced" | "high",
                    },
                  }))
                }
              >
                <option value="low">Low · fastest</option>
                <option value="balanced">Balanced</option>
                <option value="high">High · finest shadows</option>
              </select>
            </label>
            {(["sunAzimuth", "sunElevation", "daylight"] as const).map(
              (k, i) => (
                <label className="range-row" key={k}>
                  <span>
                    {["Sun bearing", "Sun elevation", "Daylight strength"][i]}
                    <b>{home.lighting[k]}</b>
                  </span>
                  <input
                    type="range"
                    min={i === 1 ? 5 : 0}
                    max={i === 0 ? 360 : i === 1 ? 80 : 5}
                    step={i === 2 ? 0.1 : 1}
                    defaultValue={home.lighting[k]}
                    key={home.lighting[k]}
                    onPointerUp={(e) => {
                      const value = +(e.target as HTMLInputElement).value;
                      mutate((h) => ({
                        ...h,
                        lighting: { ...h.lighting, [k]: value },
                      }));
                    }}
                    onKeyUp={(e) => {
                      if (e.key.startsWith("Arrow")) {
                        const value = +(e.target as HTMLInputElement).value;
                        mutate((h) => ({
                          ...h,
                          lighting: { ...h.lighting, [k]: value },
                        }));
                      }
                    }}
                  />
                </label>
              ),
            )}
          </div>
          <details className="qa-card">
            <summary>{warnings.length} review notes</summary>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <small>Geometry and clearance status: provisional.</small>
          </details>
          <details className="qa-card">
            <summary>Asset provenance</summary>
            {home.licenses.map((l) => (
              <p key={l.name}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.name}
                </a>{" "}
                · {l.license}
              </p>
            ))}
            <p>Beds and fitted modules: procedural studio models.</p>
          </details>
        </aside>
      </section>
      {error && (
        <div className="error-toast" role="alert">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
    </main>
  );
}
function PropertyPanel({
  entity,
  kind,
  onChange,
  architecture,
}: {
  entity:
    | HomeModel["furniture"][number]
    | HomeModel["openings"][number]
    | HomeModel["walls"][number]
    | HomeModel["rooms"][number];
  kind: EntityKind;
  onChange: (p: Record<string, unknown>) => void;
  architecture: boolean;
}) {
  const structural = kind !== "furniture";
  const numeric = (k: string, v: number, label: string) => (
    <label className="field" key={k + "-" + v}>
      <span>
        {label} {k === "angle" ? "°" : "cm"}
      </span>
      <input
        type="number"
        disabled={structural && !architecture}
        defaultValue={Number(v.toFixed(2))}
        onBlur={(e) => {
          const n = +e.target.value;
          if (Number.isFinite(n) && n !== v)
            onChange({ [k]: k === "angle" ? (n * Math.PI) / 180 : n });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
  return (
    <div className="property-panel">
      <div className="selected-heading">
        <strong>{entity.name}</strong>
        <small>{kind}</small>
      </div>
      <label className="field">
        <span>Name</span>
        <input
          defaultValue={entity.name}
          key={entity.name}
          onBlur={(e) => {
            if (e.target.value !== entity.name)
              onChange({ name: e.target.value });
          }}
        />
      </label>
      {(kind === "furniture" || kind === "opening") && (
        <div className="field-grid">
          {numeric("x", entity.x, "X")}
          {numeric("y", entity.y, "Y")}
          {numeric("angle", (entity.angle * 180) / Math.PI, "Rotation")}
          {numeric("elevation", entity.elevation, "Elevation")}
          {numeric("width", (entity as Furniture).width, "Width")}
          {numeric("depth", (entity as Furniture).depth, "Depth")}
          {numeric("height", (entity as Furniture).height, "Height")}
        </div>
      )}
      {kind === "wall" && (
        <div className="field-grid">
          {["xStart", "yStart", "xEnd", "yEnd", "height", "thickness"].map(
            (k) =>
              numeric(k, (entity as unknown as Record<string, number>)[k], k),
          )}
        </div>
      )}
      {kind === "room" && (
        <>
          <label className="field">
            <span>Boundary points · cm</span>
            <textarea
              disabled={!architecture}
              defaultValue={(entity as HomeModel["rooms"][number]).points
                .map((p) => `${p.x}, ${p.y}`)
                .join("\n")}
              onBlur={(e) => {
                const p = e.target.value
                  .split("\n")
                  .map((l) => l.split(",").map(Number));
                if (
                  p.length >= 3 &&
                  p.every((v) => v.length === 2 && v.every(Number.isFinite))
                )
                  onChange({ points: p.map(([x, y]) => ({ x, y })) });
              }}
            />
          </label>
          <small>
            Provisional source polygon ·{" "}
            {roomArea(entity as HomeModel["rooms"][number]).toFixed(2)} m²
          </small>
        </>
      )}
      <label className="field">
        <span>Material family</span>
        <select
          value={entity.finish ?? "ivory"}
          onChange={(e) => onChange({ finish: e.target.value as Finish })}
        >
          {["ivory", "walnut", "stone", "bronze", "fabric", "greige"].map(
            (f) => (
              <option key={f}>{f}</option>
            ),
          )}
        </select>
      </label>
      <label className="colour-field">
        <span>Tint</span>
        <input
          type="color"
          defaultValue={entity.color ?? "#ffffff"}
          key={entity.color}
          onBlur={(e) => onChange({ color: e.target.value })}
        />
      </label>
      {kind === "furniture" && (
        <p className="subtle-note">{(entity as Furniture).assetNote}</p>
      )}
      {structural && !architecture && (
        <p className="subtle-note">
          Enable Architecture mode to edit geometry.
        </p>
      )}
    </div>
  );
}
