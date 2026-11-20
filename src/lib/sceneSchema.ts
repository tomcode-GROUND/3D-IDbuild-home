import { z } from "./validation.ts";

const finite = z.number().min(-1e7).max(1e7);
const positive = finite.check(z.gt(0));
const vector = z.tuple([finite, finite, finite]);
const xy = z.object({ x: finite, y: finite });
const base = {
  ...xy.shape,
  id: z.string(),
  name: z.string(),
  elevation: finite,
  angle: finite,
  hidden: z.boolean().optional(),
  color: z.string().optional(),
  finish: z
    .enum(["ivory", "walnut", "stone", "bronze", "fabric", "greige"])
    .optional(),
};
const size = {
  width: positive,
  depth: positive,
  height: positive,
  model: z.string().optional(),
  modelMirrored: z.boolean(),
};
export const sceneSchema = z.object({
  name: z.string(),
  version: z.string(),
  wallHeight: positive,
  furniture: z
    .array(
      z.object({
        ...base,
        ...size,
        kind: z.literal("furniture"),
        movable: z.boolean(),
        generator: z
          .enum([
            "media",
            "sofa",
            "bed",
            "chair",
            "table",
            "coffee",
            "cabinet",
            "desk",
            "rug",
            "curtain",
            "pendant",
            "lamp",
            "plant",
            "toilet",
            "basin",
            "shower",
            "bath",
            "counter",
            "fridge",
            "shelf",
          ])
          .optional(),
        zoneId: z.string().optional(),
        clearance: finite.optional(),
        assetNote: z.string().optional(),
      }),
    )
    .max(3000),
  walls: z
    .array(
      z.object({
        ...base,
        kind: z.literal("wall"),
        xStart: finite,
        yStart: finite,
        xEnd: finite,
        yEnd: finite,
        height: positive,
        thickness: positive,
        sourceIds: z.array(z.string()).optional(),
      }),
    )
    .max(3000),
  openings: z
    .array(
      z.object({
        ...base,
        ...size,
        kind: z.literal("opening"),
        boundToWall: z.boolean(),
        cutOutShape: z.string().optional(),
        wallThickness: finite.optional(),
        wallDistance: finite.optional(),
        sashes: z
          .array(
            z.object({
              xAxis: finite,
              yAxis: finite,
              width: finite,
              startAngle: finite,
              endAngle: finite,
            }),
          )
          .optional(),
      }),
    )
    .max(3000),
  rooms: z
    .array(
      z.object({
        ...base,
        kind: z.literal("room"),
        points: z.array(xy).max(500),
        ceilingVisible: z.boolean(),
        ceilingFlat: z.boolean(),
      }),
    )
    .max(1000),
  zones: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        points: z.array(xy).max(500),
        provisional: z.boolean(),
        finish: base.finish.unwrap(),
      }),
    )
    .max(1000),
  viewpoints: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        position: vector,
        target: vector,
      }),
    )
    .max(1000),
  licenses: z
    .array(z.object({ name: z.string(), license: z.string(), url: z.string() }))
    .max(1000),
  lighting: z.object({
    sunAzimuth: finite,
    sunElevation: finite,
    ambient: finite,
    daylight: finite,
    preset: z.enum(["day", "evening"]).optional(),
    quality: z.enum(["low", "balanced", "high"]).optional(),
  }),
  background: z
    .object({ scale: positive, xOrigin: finite, yOrigin: finite })
    .optional(),
  backgroundScale: finite.optional(),
  warnings: z.array(z.string()).max(3000),
  validation: z.enum(["provisional", "changed"]),
  sourceChecksum: z.string().optional(),
});
