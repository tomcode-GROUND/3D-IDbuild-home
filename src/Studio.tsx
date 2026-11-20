import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PlanPreview, TraceReview } from "./components/TraceReview";
import { download } from "./lib/download";
import { parseSh3d } from "./lib/sh3d";
import { blankReview, buildPlan, parseProposal } from "./lib/planAnalysis";
import { analysisImage, maxUpload, preparePlan } from "./lib/planFiles";
import {
  copyProject,
  listLocal,
  newProject,
  openProject,
  packProject,
  saveLocal,
} from "./lib/projects";
import type { Project } from "./lib/projects";
import type { HomeModel, ImportSource } from "./lib/types";
import "./Studio.css";

const Editor = lazy(() => import("./App"));
const defaultModel = "gpt-4.1-mini";
function archive(project: Project) {
  const name = project.title.replace(/[^a-z0-9 _.-]/gi, "_");
  download(
    new Blob([Uint8Array.from(packProject(project)).buffer]),
    name + ".fdwz3d",
  );
}
async function localRequest(
  path: string,
  body: object,
  key: string,
  signal: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch("/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch {
    if (signal.aborted) throw Error("Request cancelled.");
    throw Error("Cannot connect to the local studio service.");
  }
  const result = await res.json().catch(() => null);
  if (!res.ok || !result)
    throw Error(
      result?.error ?? "Start the local studio with npm run dev or npm start.",
    );
  return result;
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not complete this action.";
}

export default function Studio() {
  const [project, setProject] = useState<Project>();
  const current = useRef<Project | undefined>(undefined);
  const [library, setLibrary] = useState<Project[]>([]);
  const [editing, setEditing] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [prompt, setPrompt] = useState("");
  const [dragging, setDragging] = useState(false);
  const ai = useRef<AbortController | null>(null);
  const validation = useRef<AbortController | null>(null);
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const upload = useRef(0);

  function refreshLibrary() {
    void listLocal()
      .then((items) =>
        setLibrary(
          items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        ),
      )
      .catch(() =>
        setSaveStatus(
          "Browser storage is unavailable. Download a project for recovery.",
        ),
      );
  }
  useEffect(refreshLibrary, []);
  useEffect(() => {
    const clear = () => {
      ai.current?.abort();
      validation.current?.abort();
      setKey("");
      setKeyStatus("");
      setShowKey(false);
    };
    window.addEventListener("pagehide", clear);
    return () => window.removeEventListener("pagehide", clear);
  }, []);

  const replace = useCallback((value: Project | undefined) => {
    current.current = value;
    setProject(value);
  }, []);
  const persist = useCallback((value: Project) => {
    setSaveStatus("Saving…");
    const task = saves.current
      .catch(() => undefined)
      .then(() => saveLocal(value));
    saves.current = task;
    void task.then(
      () => {
        if (current.current === value) setSaveStatus("Saved in this browser");
      },
      () =>
        setSaveStatus(
          "Local save failed. Download the project to keep a copy.",
        ),
    );
  }, []);
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => persist(project), 450);
    return () => clearTimeout(timer);
  }, [project, persist]);
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && current.current)
        persist(current.current);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [persist]);
  const update = useCallback(
    (patch: Partial<Project>) => {
      if (!current.current) return;
      const value = {
        ...current.current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setSaveStatus("Unsaved changes");
      replace(value);
    },
    [replace],
  );

  function cancelAi() {
    ai.current?.abort();
    ai.current = null;
    setBusy("");
  }
  function transition(value: Project, editor = false) {
    cancelAi();
    ++upload.current;
    if (current.current) persist(current.current);
    replace(value);
    setSaveStatus("Saving…");
    setPrompt("");
    setError("");
    setEditing(editor);
    if (editor) setEditorSession((s) => s + 1);
  }
  async function selectFile(file: File, legacy = false) {
    cancelAi();
    const op = ++upload.current;
    setError("");
    setBusy("Reading file…");
    try {
      if (file.size > (legacy ? 100_000_000 : maxUpload))
        throw Error(
          legacy
            ? "Project archives must be below 100 MB."
            : "Choose a floor plan below 20 MB.",
        );
      const source: ImportSource = {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      };
      if (op !== upload.current) return;
      if (legacy) {
        const opened = openProject(source);
        if (!opened.raster && opened.origin === "plan") {
          const { raster } = await preparePlan(opened.source, opened.page);
          opened.raster = raster;
        }
        if (op === upload.current) transition(opened, Boolean(opened.home));
        return;
      }
      setBusy("Preparing plan preview…");
      const { raster, pages } = await preparePlan(source, 1);
      if (op === upload.current)
        transition({ ...newProject(source, "plan"), raster, pages });
    } catch (e) {
      if (op === upload.current)
        setError("Could not open the file. " + message(e));
    } finally {
      if (op === upload.current) setBusy("");
    }
  }
  async function changePage(page: number) {
    const p = current.current;
    if (!p || p.page === page) return;
    if (p.home) {
      setError(
        "Save a copy or upload the PDF again to trace a different page.",
      );
      return;
    }
    cancelAi();
    const op = ++upload.current;
    setBusy("Rendering selected page…");
    setError("");
    try {
      const { raster } = await preparePlan(p.source, page);
      if (op === upload.current)
        update({
          page,
          raster,
          proposal: undefined,
          review: { ...blankReview },
          messages: [],
          model: "",
        });
    } catch (e) {
      if (op === upload.current) setError(message(e));
    } finally {
      if (op === upload.current) setBusy("");
    }
  }
  async function demo() {
    const op = ++upload.current;
    setBusy("Opening furnished demo…");
    setError("");
    try {
      const [{ furnish }, response] = await Promise.all([
        import("./lib/design"),
        fetch("/fixtures/juniper.sh3d"),
      ]);
      if (!response.ok) throw Error("The demo floor plan is missing.");
      const source = {
        name: "juniper.sh3d",
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
      const home = furnish(parseSh3d(source.bytes));
      if (op === upload.current)
        transition(
          {
            ...newProject(source, "sh3d"),
            title: "Juniper Apartment",
            home,
          },
          true,
        );
    } catch (e) {
      if (op === upload.current) setError(message(e));
    } finally {
      if (op === upload.current) setBusy("");
    }
  }
  function resetKeyStatus() {
    validation.current?.abort();
    validation.current = null;
    cancelAi();
    setKeyStatus("");
  }
  async function validateKey() {
    validation.current?.abort();
    const controller = new AbortController();
    validation.current = controller;
    setKeyStatus("Validating…");
    try {
      const result = await localRequest(
        "validate",
        { model: model.trim() },
        key.trim(),
        controller.signal,
      );
      if (validation.current === controller && result.validated)
        setKeyStatus("Validated · model accessible");
    } catch (e) {
      if (validation.current === controller)
        setKeyStatus("Validation failed · " + message(e));
    } finally {
      if (validation.current === controller) validation.current = null;
    }
  }
  async function analyze() {
    const p = current.current;
    if (!p?.raster || busy) return;
    setError("");
    if (!key.trim()) {
      setError("Enter your OpenAI API key to analyse this plan.");
      return;
    }
    if (
      (key.trim() && prompt.includes(key.trim())) ||
      /\bsk-[a-zA-Z0-9_-]{12,}/.test(prompt)
    ) {
      setError(
        "Remove the credential from your message and use the OpenAI key panel.",
      );
      return;
    }
    const text = prompt.trim();
    const messages = (
      text ? [...p.messages, { role: "user" as const, text }] : p.messages
    ).slice(-23);
    if (text) {
      update({ messages });
      setPrompt("");
    }
    ai.current?.abort();
    const controller = new AbortController();
    ai.current = controller;
    setBusy("Analysing floor plan…");
    try {
      const image = await analysisImage(p.raster);
      if (controller.signal.aborted) return;
      const result = await localRequest(
        "analyze",
        { model: model.trim(), image, messages, review: p.review },
        key.trim(),
        controller.signal,
      );
      if (ai.current !== controller || current.current?.id !== p.id) return;
      const proposal = parseProposal(result.proposal);
      update({
        proposal,
        model: result.model,
        review: { ...current.current.review, approved: false },
        messages: [
          ...messages,
          {
            role: "assistant",
            text: [proposal.summary, ...proposal.questions].join("\n"),
          },
        ],
      });
    } catch (e) {
      if (ai.current === controller) setError(message(e));
    } finally {
      if (ai.current === controller) {
        ai.current = null;
        setBusy("");
      }
    }
  }
  function generate() {
    const p = current.current;
    if (!p?.proposal || !p.raster || busy) return;
    try {
      const home = buildPlan(
        p.proposal,
        p.review,
        p.raster.bytes,
        p.raster.width,
        p.raster.height,
        p.title,
      );
      update({
        home,
        accepted: { proposal: p.proposal, review: p.review, model: p.model },
      });
      setError("");
      setEditorSession((s) => s + 1);
      setEditing(true);
    } catch (e) {
      setError(message(e));
    }
  }
  const editorChange = useCallback(
    (home: HomeModel) => {
      if (current.current?.home !== home) update({ home });
    },
    [update],
  );
  function exportProject(home?: HomeModel) {
    if (!current.current) return;
    if (home) editorChange(home);
    try {
      archive(current.current);
    } catch (e) {
      setError(message(e));
    }
  }
  if (editing && project?.home)
    return (
      <>
        {error && (
          <p className="studio-alert" role="alert">
            {error}
          </p>
        )}
        <Suspense
          fallback={<p className="studio-loading">Opening editable model…</p>}
        >
          <Editor
            key={editorSession}
            initialHome={project.home}
            title={project.title}
            onChange={editorChange}
            onSave={exportProject}
            onBack={(home) => {
              editorChange(home);
              setEditing(false);
              refreshLibrary();
            }}
          />
        </Suspense>
      </>
    );

  return (
    <main className="studio">
      <header className="studio-header">
        <span className="studio-wordmark">
          <img src="/favicon.svg" alt="" /> 3D IDbuild home
        </span>
        <details className="studio-keys">
          <summary>OpenAI key {key ? "· configured" : ""}</summary>
          <div className="studio-card key-popover">
            <label>
              OpenAI API key
              <input
                type={showKey ? "text" : "password"}
                value={key}
                autoComplete="off"
                onChange={(e) => {
                  resetKeyStatus();
                  setKey(e.target.value);
                }}
                maxLength={512}
              />
            </label>
            <label>
              Vision model
              <input
                value={model}
                maxLength={80}
                onChange={(e) => {
                  resetKeyStatus();
                  setModel(e.target.value);
                }}
              />
            </label>
            <div className="studio-actions">
              <button onClick={() => setShowKey((s) => !s)}>
                {showKey ? "Hide" : "Show"}
              </button>
              <button
                disabled={!key.trim() || keyStatus === "Validating…"}
                onClick={validateKey}
              >
                Validate
              </button>
              <button
                disabled={!key}
                onClick={() => {
                  resetKeyStatus();
                  setKey("");
                  setShowKey(false);
                }}
              >
                Remove
              </button>
            </div>
            <p aria-live="polite">
              {keyStatus ||
                (key
                  ? "Entered · validation pending"
                  : "Your key is kept in this page session.")}
            </p>
          </div>
        </details>
      </header>
      <div className="studio-body">
        <section className="studio-hero">
          <h1>
            From floor plan
            <br />
            to editable 3D.
          </h1>
          <p>
            Upload a drawing, review its dimensions with OpenAI, then open the
            trace as a model you can edit.
          </p>
        </section>
        <label
          className={`studio-upload ${dragging ? "drag-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void selectFile(file);
          }}
        >
          <span className="upload-icon" aria-hidden="true">
            ↑
          </span>
          <strong>Drop a floor plan or browse files</strong>
          <span>PNG, JPEG or PDF · up to 20 MB</span>
          <input
            type="file"
            aria-label="Upload floor plan"
            accept=".png,.jpg,.jpeg,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void selectFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <div className="studio-actions studio-library">
          <button disabled={Boolean(busy)} onClick={demo}>
            Open demo
          </button>
          <label className="studio-file-button">
            Import project
            <input
              type="file"
              aria-label="Import project"
              accept=".sh3d,.fdwz3d"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void selectFile(f, true);
                e.target.value = "";
              }}
            />
          </label>
          <details
            onToggle={(e) => {
              if (e.currentTarget.open) refreshLibrary();
            }}
          >
            <summary>Saved projects</summary>
            <div className="studio-card project-popover">
              {library.length ? (
                library.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (current.current?.id === item.id) {
                        setEditing(Boolean(current.current.home));
                        return;
                      }
                      transition(item, Boolean(item.home));
                    }}
                  >
                    {item.title} ·{" "}
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </button>
                ))
              ) : (
                <span>No saved projects yet.</span>
              )}
            </div>
          </details>
        </div>
        {busy && (
          <p role="status">
            {busy}{" "}
            {busy === "Analysing floor plan…" && (
              <button onClick={cancelAi}>Cancel analysis</button>
            )}
          </p>
        )}
        {error && (
          <p className="studio-alert" role="alert">
            {error}
          </p>
        )}
        {project && (
          <>
            <section className="studio-card project-info">
              <label>
                Project name
                <input
                  value={project.title}
                  maxLength={200}
                  onChange={(e) =>
                    update({ title: e.target.value || "Untitled plan" })
                  }
                />
              </label>
              {project.pages > 1 && (
                <label>
                  PDF page
                  <select
                    value={project.page}
                    disabled={Boolean(busy) || Boolean(project.home)}
                    onChange={(e) => changePage(Number(e.target.value))}
                  >
                    {Array.from({ length: project.pages }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1} of {project.pages}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="studio-actions">
                <button
                  onClick={() => transition(copyProject(project, " (copy)"))}
                >
                  Save a copy
                </button>
                <button onClick={() => exportProject()}>
                  Download project
                </button>
                <button
                  onClick={() =>
                    download(
                      new Blob([Uint8Array.from(project.source.bytes).buffer]),
                      project.sourceName,
                    )
                  }
                >
                  Download original
                </button>
                {project.home && (
                  <button
                    className="studio-primary"
                    onClick={() => {
                      setEditorSession((s) => s + 1);
                      setEditing(true);
                    }}
                  >
                    Resume editing
                  </button>
                )}
              </div>
              <small role="status">{saveStatus}</small>
            </section>
            {project.raster && !project.proposal && (
              <PlanPreview raster={project.raster} review={project.review} />
            )}
            {project.raster && project.proposal && (
              <TraceReview
                proposal={project.proposal}
                review={project.review}
                raster={project.raster}
                changeReview={(review) => update({ review })}
                changeTrace={(proposal) => {
                  cancelAi();
                  update({
                    proposal,
                    review: { ...project.review, approved: false },
                  });
                }}
                generate={generate}
                hasScene={Boolean(project.home)}
              />
            )}
          </>
        )}
        <section className="studio-card studio-chat">
          <h2>Plan assistant</h2>
          {project?.messages.length ? (
            <div className="chat-history" aria-live="polite">
              {project.messages.map((m, i) => (
                <p key={i}>
                  <strong>{m.role === "user" ? "You" : "Assistant"}</strong>
                  {m.text}
                </p>
              ))}
            </div>
          ) : (
            <p>
              After uploading a plan, ask about a dimension or start the
              analysis.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void analyze();
            }}
          >
            <label className="sr-only" htmlFor="plan-message">
              Message for the plan assistant
            </label>
            <textarea
              id="plan-message"
              value={prompt}
              maxLength={2000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Add measurements or instructions…"
              rows={2}
            />
            <div className="chat-actions">
              <small>
                Analysis sends the selected image and conversation to OpenAI and
                may incur API charges.
              </small>
              <button
                className="studio-primary"
                disabled={!project?.raster || Boolean(busy)}
              >
                {prompt.trim() ? "Send" : "Analyse plan"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
