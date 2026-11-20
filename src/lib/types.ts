export type EntityKind = "furniture" | "opening" | "wall" | "room";
export type Finish =
  "ivory" | "walnut" | "stone" | "bronze" | "fabric" | "greige";
export interface BaseEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  elevation: number;
  angle: number;
  color?: string;
  hidden?: boolean;
  finish?: Finish;
}
export type Generator =
  | "media"
  | "sofa"
  | "bed"
  | "chair"
  | "table"
  | "coffee"
  | "cabinet"
  | "desk"
  | "rug"
  | "curtain"
  | "pendant"
  | "lamp"
  | "plant"
  | "toilet"
  | "basin"
  | "shower"
  | "bath"
  | "counter"
  | "fridge"
  | "shelf";
export interface Furniture extends BaseEntity {
  kind: "furniture";
  width: number;
  depth: number;
  height: number;
  model?: string;
  modelMirrored: boolean;
  movable: boolean;
  generator?: Generator;
  zoneId?: string;
  clearance?: number;
  assetNote?: string;
}
export interface Opening extends BaseEntity {
  kind: "opening";
  width: number;
  depth: number;
  height: number;
  model?: string;
  modelMirrored: boolean;
  boundToWall: boolean;
  cutOutShape?: string;
  wallThickness?: number;
  wallDistance?: number;
  sashes?: Array<{
    xAxis: number;
    yAxis: number;
    width: number;
    startAngle: number;
    endAngle: number;
  }>;
}
export interface Wall extends BaseEntity {
  kind: "wall";
  xStart: number;
  yStart: number;
  xEnd: number;
  yEnd: number;
  height: number;
  thickness: number;
  sourceIds?: string[];
}
export interface Room extends BaseEntity {
  kind: "room";
  points: Array<{ x: number; y: number }>;
  ceilingVisible: boolean;
  ceilingFlat: boolean;
}
export interface DesignZone {
  id: string;
  name: string;
  points: Array<{ x: number; y: number }>;
  provisional: boolean;
  finish: Finish;
}
export interface Viewpoint {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}
export interface LightingSettings {
  sunAzimuth: number;
  sunElevation: number;
  ambient: number;
  daylight: number;
  preset?: "day" | "evening";
  quality?: "low" | "balanced" | "high";
}
export interface AssetLicense {
  name: string;
  license: string;
  url: string;
}
export interface HomeModel {
  name: string;
  version: string;
  wallHeight: number;
  furniture: Furniture[];
  openings: Opening[];
  walls: Wall[];
  rooms: Room[];
  backgroundImage?: Uint8Array;
  backgroundScale?: number;
  background?: { scale: number; xOrigin: number; yOrigin: number };
  assets: Record<string, Uint8Array>;
  warnings: string[];
  lighting: LightingSettings;
  zones: DesignZone[];
  viewpoints: Viewpoint[];
  licenses: AssetLicense[];
  validation: "provisional" | "changed";
  sourceChecksum?: string;
}
export type DocumentState = Pick<
  HomeModel,
  | "furniture"
  | "openings"
  | "walls"
  | "rooms"
  | "lighting"
  | "zones"
  | "viewpoints"
  | "licenses"
  | "validation"
  | "warnings"
>;
export interface ProjectManifest {
  format: "fdwz-3d-editor";
  version: 1 | 2;
  sourceName: string;
  sourceChecksum?: string;
  savedAt: string;
  state: DocumentState;
  assetPaths?: string[];
}
export interface Selection {
  kind: EntityKind;
  id: string;
}
export type ImportSource = { name: string; bytes: Uint8Array };
