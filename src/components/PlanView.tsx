import { useEffect, useMemo, useState } from "react";
import type { HomeModel, Selection } from "../lib/types";
interface Props {
  home: HomeModel;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  onFurnitureMove: (id: string, x: number, y: number, commit: boolean) => void;
  snap: number;
}
export function PlanView({
  home,
  selection,
  onSelect,
  onFurnitureMove,
  snap,
}: Props) {
  const [bg, setBg] = useState<{
      url: string;
      width: number;
      height: number;
    } | null>(null),
    [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(
      null,
    );
  const b = useMemo(() => {
    const xs = home.walls.flatMap((w) => [w.xStart, w.xEnd]),
      ys = home.walls.flatMap((w) => [w.yStart, w.yEnd]);
    return {
      x: Math.min(...xs) - 80,
      y: Math.min(...ys) - 80,
      w: Math.max(...xs) - Math.min(...xs) + 160,
      h: Math.max(...ys) - Math.min(...ys) + 160,
    };
  }, [home.walls]);
  useEffect(() => {
    if (!home.backgroundImage) return;
    const u = URL.createObjectURL(
      new Blob([Uint8Array.from(home.backgroundImage).buffer]),
    );
    const im = new Image();
    im.onload = () => setBg({ url: u, width: im.width, height: im.height });
    im.src = u;
    return () => URL.revokeObjectURL(u);
  }, [home.backgroundImage]);
  const point = (e: React.PointerEvent<SVGElement>) => {
    const svg = (
      e.currentTarget instanceof SVGSVGElement
        ? e.currentTarget
        : e.currentTarget.ownerSVGElement
    )!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const snapped = (n: number) => (snap ? Math.round(n / snap) * snap : n);
  return (
    <div className="plan-wrap">
      <div className="plan-legend">
        Editable plan · drag furniture to move it
      </div>
      <svg
        className="plan-canvas"
        viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
        onPointerMove={(e) => {
          if (drag) {
            const p = point(e);
            onFurnitureMove(
              drag.id,
              snapped(p.x - drag.x),
              snapped(p.y - drag.y),
              false,
            );
          }
        }}
        onPointerUp={(e) => {
          if (drag) {
            const p = point(e);
            onFurnitureMove(
              drag.id,
              snapped(p.x - drag.x),
              snapped(p.y - drag.y),
              true,
            );
            setDrag(null);
          }
        }}
        aria-label="Editable floor plan"
      >
        <defs>
          <pattern
            id="grid"
            width={snap || 10}
            height={snap || 10}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${snap || 10} 0 H 0 V ${snap || 10}`}
              fill="none"
              stroke="#c9c0b1"
              strokeWidth=".4"
            />
          </pattern>
        </defs>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#f0ece3" />
        {bg && home.background && (
          <image
            href={bg.url}
            x={-home.background.xOrigin * home.background.scale}
            y={-home.background.yOrigin * home.background.scale}
            width={bg.width * home.background.scale}
            height={bg.height * home.background.scale}
            opacity=".3"
          />
        )}
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#grid)" />
        {home.zones.map((z) => (
          <g key={z.id}>
            <polygon
              points={z.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="#c7b99c"
              opacity=".18"
            />
            <text
              x={z.points.reduce((s, p) => s + p.x, 0) / z.points.length}
              y={z.points.reduce((s, p) => s + p.y, 0) / z.points.length}
              textAnchor="middle"
              fontSize="12"
              fill="#8c7756"
            >
              {z.name}
            </text>
          </g>
        ))}
        {home.rooms.map((r) => (
          <polygon
            key={r.id}
            points={r.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="transparent"
            stroke={selection?.id === r.id ? "#d99741" : "#aca591"}
            strokeWidth="1"
            onClick={() => onSelect({ kind: "room", id: r.id })}
          />
        ))}
        {home.walls.map((w) => (
          <line
            key={w.id}
            x1={w.xStart}
            y1={w.yStart}
            x2={w.xEnd}
            y2={w.yEnd}
            stroke={selection?.id === w.id ? "#c99545" : "#5d594f"}
            strokeWidth={w.thickness}
            onClick={() => onSelect({ kind: "wall", id: w.id })}
          />
        ))}
        {home.openings
          .filter((o) => !o.hidden)
          .map((o) => (
            <rect
              key={o.id}
              x={o.x - o.width / 2}
              y={o.y - o.depth / 2}
              width={o.width}
              height={o.depth}
              transform={`rotate(${(o.angle * 180) / Math.PI} ${o.x} ${o.y})`}
              fill={selection?.id === o.id ? "#db9c3f" : "#87aaa4"}
              onClick={() => onSelect({ kind: "opening", id: o.id })}
            />
          ))}
        {home.furniture
          .filter((f) => !f.hidden)
          .map((f) => (
            <g
              key={f.id}
              transform={`translate(${f.x} ${f.y}) rotate(${(f.angle * 180) / Math.PI})`}
              className="piece-group"
              onPointerDown={(e) => {
                e.stopPropagation();
                const p = point(e);
                e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                setDrag({ id: f.id, x: p.x - f.x, y: p.y - f.y });
                onSelect({ kind: "furniture", id: f.id });
              }}
            >
              <rect
                x={-f.width / 2}
                y={-f.depth / 2}
                width={f.width}
                height={f.depth}
                rx={f.generator === "table" ? f.width / 2 : 4}
                fill={
                  selection?.id === f.id
                    ? "#ca9853"
                    : f.generator === "rug"
                      ? "#ded5c4"
                      : "#a9977c"
                }
                fillOpacity={f.generator === "rug" ? 0.25 : 0.8}
                stroke="#fff8e9"
                strokeWidth="1.5"
              />
              <title>{f.name}</title>
            </g>
          ))}
      </svg>
      <p className="plan-help">
        Dimensions in centimetres · source and design zones remain independently
        editable.
      </p>
    </div>
  );
}
