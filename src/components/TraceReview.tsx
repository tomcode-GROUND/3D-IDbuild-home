import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { parseProposal, reviewPlan } from "../lib/planAnalysis";
import type { Point, Proposal, Review } from "../lib/planAnalysis";
import type { Raster } from "../lib/planFiles";
import { download } from "../lib/download";

export function PlanPreview({
  raster,
  proposal,
  review,
  onPick,
}: {
  raster: Raster;
  proposal?: Proposal;
  review: Review;
  onPick?: (p: Point) => void;
}) {
  const image = useRef<SVGImageElement>(null);
  useEffect(() => {
    const next = URL.createObjectURL(
      new Blob([Uint8Array.from(raster.bytes).buffer], { type: "image/png" }),
    );
    const element = image.current;
    element?.setAttribute("href", next);
    return () => URL.revokeObjectURL(next);
  }, [raster]);
  const at = (p: Point) => `${p.x * raster.width},${p.y * raster.height}`;
  const line = (a: Point, b: Point, cls: string, key: number | string) => (
    <line
      key={key}
      className={cls}
      x1={a.x * raster.width}
      y1={a.y * raster.height}
      x2={b.x * raster.width}
      y2={b.y * raster.height}
    />
  );
  function pick(event: MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    onPick?.({
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    });
  }
  return (
    <svg
      className={onPick ? "trace-image picking" : "trace-image"}
      viewBox={`0 0 ${raster.width} ${raster.height}`}
      onClick={onPick ? pick : undefined}
      aria-label="Floor plan and proposed geometry"
    >
      <image ref={image} width={raster.width} height={raster.height} />
      {proposal?.rooms.map((r, i) => (
        <polygon
          key={i}
          className="trace-room"
          points={r.points.map(at).join(" ")}
        />
      ))}
      {proposal?.walls.map((w, i) => line(w.a, w.b, "trace-wall", i))}
      {proposal?.openings.map((o, i) => {
        const w = proposal.walls[o.wall];
        const between = (t: number) => ({
          x: w.a.x + (w.b.x - w.a.x) * t,
          y: w.a.y + (w.b.y - w.a.y) * t,
        });
        return line(between(o.start), between(o.end), "trace-" + o.type, i);
      })}
      {review.a && review.b && line(review.a, review.b, "trace-scale", "scale")}
      {[review.a, review.b].map(
        (p, i) =>
          p && (
            <circle
              key={i}
              className="trace-marker"
              cx={p.x * raster.width}
              cy={p.y * raster.height}
              r={Math.max(raster.width, raster.height) * 0.008}
            />
          ),
      )}
    </svg>
  );
}

function WallCorrection({
  proposal,
  change,
}: {
  proposal: Proposal;
  change: (p: Proposal) => void;
}) {
  const [index, setIndex] = useState(0);
  const wall = proposal.walls[Math.min(index, proposal.walls.length - 1)];
  const [error, setError] = useState("");
  if (!wall) return null;
  return (
    <details>
      <summary>Adjust a wall</summary>
      <p>
        Coordinates are percentages across the source image. Review adjacent
        room boundaries after moving a wall.
      </p>
      <label>
        Wall
        <select
          value={Math.min(index, proposal.walls.length - 1)}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            setError("");
          }}
        >
          {proposal.walls.map((_, i) => (
            <option key={i} value={i}>
              Wall {i + 1}
            </option>
          ))}
        </select>
      </label>
      <form
        key={JSON.stringify(wall)}
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          const coordinate = (name: string) => Number(values.get(name)) / 100;
          const thickness = values.get("thickness");
          const walls = [...proposal.walls];
          walls[Math.min(index, walls.length - 1)] = {
            a: { x: coordinate("ax"), y: coordinate("ay") },
            b: { x: coordinate("bx"), y: coordinate("by") },
            thicknessCm: thickness ? Number(thickness) : null,
          };
          try {
            change(parseProposal({ ...proposal, walls }));
            setError("");
          } catch {
            setError("Enter two different endpoints and a valid thickness.");
          }
        }}
      >
        <div className="field-row">
          {(["a", "b"] as const).flatMap((end) =>
            (["x", "y"] as const).map((axis) => (
              <label key={end + axis}>
                {end.toUpperCase()} {axis} (%)
                <input
                  required
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  name={end + axis}
                  defaultValue={wall[end][axis] * 100}
                />
              </label>
            )),
          )}
          <label>
            Thickness (cm)
            <input
              type="number"
              step="any"
              min="1"
              max="100"
              name="thickness"
              defaultValue={wall.thicknessCm ?? ""}
            />
          </label>
        </div>
        <button>Apply wall change</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}

export function TraceReview({
  proposal,
  review,
  raster,
  changeReview,
  changeTrace,
  generate,
  hasScene,
}: {
  proposal: Proposal;
  review: Review;
  raster: Raster;
  changeReview: (r: Review) => void;
  changeTrace: (p: Proposal) => void;
  generate: () => void;
  hasScene: boolean;
}) {
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const report = reviewPlan(proposal, review, raster.width, raster.height);
  const apply = (patch: Partial<Review>) =>
    changeReview({ ...review, ...patch, approved: false });
  return (
    <section className="studio-card review-card">
      <h2>Review the proposed trace</h2>
      <p>
        Walls are blue, doors amber, windows violet. Select two points whose
        real distance you know, or use a visible dimension below.
      </p>
      <PlanPreview
        raster={raster}
        proposal={proposal}
        review={review}
        onPick={(p) => {
          if (!review.a || review.b) apply({ a: p, b: null });
          else apply({ b: p });
        }}
      />
      <ul>
        {proposal.measurements.map((m, i) => (
          <li key={i}>
            <strong>{m.label}</strong> · {m.status}
            {m.cm !== null ? ` · ${m.cm} cm` : ""} · {m.source}
            {m.a && m.b && m.cm && m.status === "observed" && (
              <button
                onClick={() =>
                  apply({ a: m.a, b: m.b, distance: String(m.cm) })
                }
              >
                Use span
              </button>
            )}
          </li>
        ))}
      </ul>
      <details>
        <summary>Set scale endpoints by coordinate</summary>
        <p>Use percentages across the plan from its top-left corner.</p>
        <div className="field-row">
          {(["a", "b"] as const).flatMap((end) =>
            (["x", "y"] as const).map((axis) => (
              <label key={end + axis}>
                Point {end.toUpperCase()} {axis} (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={
                    review[end] ? Math.round(review[end][axis] * 1000) / 10 : ""
                  }
                  onChange={(e) =>
                    apply({
                      [end]: {
                        ...(review[end] ?? { x: 0, y: 0 }),
                        [axis]:
                          Math.max(0, Math.min(100, Number(e.target.value))) /
                          100,
                      },
                    })
                  }
                />
              </label>
            )),
          )}
        </div>
      </details>
      <div className="field-row">
        <label>
          Known span (cm)
          <input
            type="number"
            value={review.distance}
            onChange={(e) => apply({ distance: e.target.value })}
          />
        </label>
        <label>
          Ceiling height (cm)
          <input
            type="number"
            value={review.height}
            onChange={(e) => apply({ height: e.target.value })}
          />
        </label>
      </div>
      <WallCorrection proposal={proposal} change={changeTrace} />
      <details
        onToggle={(e) => {
          if (e.currentTarget.open) {
            setJson(JSON.stringify(proposal, null, 2));
            setError("");
          }
        }}
      >
        <summary>Correct trace coordinates or dimensions</summary>
        <p>
          Coordinates use fractions of the full image width and height. Opening
          spans are fractions along the referenced wall.
        </p>
        <textarea
          aria-label="Trace coordinates"
          rows={10}
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
        <button
          onClick={() => {
            try {
              changeTrace(parseProposal(JSON.parse(json)));
              setError("");
            } catch {
              setError(
                "Trace could not be applied. Check the JSON, wall references and room boundaries.",
              );
            }
          }}
        >
          Apply trace edits
        </button>
        <button
          onClick={() =>
            download(
              new Blob([JSON.stringify(proposal, null, 2)], {
                type: "application/json",
              }),
              "floor-plan-trace.json",
            )
          }
        >
          Download trace
        </button>
        {error && <p role="alert">{error}</p>}
      </details>
      {report.issues.map((issue, i) => (
        <p key={i} className="review-note">
          {issue}
        </p>
      ))}
      {report.warnings.map((warning, i) => (
        <p key={i} className="review-note">
          {warning}
        </p>
      ))}
      <label className="check-row">
        <input
          type="checkbox"
          checked={review.approved}
          disabled={Boolean(report.issues.length)}
          onChange={(e) =>
            changeReview({ ...review, approved: e.target.checked })
          }
        />
        I confirm the scale and height and accept this provisional trace.
      </label>
      <button
        className="studio-primary"
        onClick={generate}
        disabled={!review.approved || Boolean(report.issues.length)}
      >
        {hasScene ? "Replace current 3D scene" : "Create editable 3D scene"}
      </button>
    </section>
  );
}
