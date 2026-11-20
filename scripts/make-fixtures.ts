import { writeFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { furnish } from "../src/lib/design.ts";
import { createProjectArchive, parseSh3d } from "../src/lib/sh3d.ts";

const walls = [
  [10, 10, 890, 10, 270],
  [890, 10, 890, 410, 270],
  [890, 410, 10, 410, 270],
  [10, 410, 10, 10, 270],
  [600, 10, 600, 410, 270],
  [334, 305, 334, 410, 110],
  [10, 10, 100, 10, 270],
];
const room = (
  name: string,
  x: number,
  y: number,
  right: number,
  bottom: number,
) =>
  `<room id="${name.toLowerCase()}" name="${name}">${[
    [x, y],
    [right, y],
    [right, bottom],
    [x, bottom],
  ]
    .map(([px, py]) => `<point x="${px}" y="${py}"/>`)
    .join("")}</room>`;
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<home version="7600" name="Juniper Apartment" wallHeight="270">
${walls
  .map(
    ([xStart, yStart, xEnd, yEnd, height], i) =>
      `<wall id="wall-${i}" xStart="${xStart}" yStart="${yStart}" xEnd="${xEnd}" yEnd="${yEnd}" height="${height}" thickness="16"/>`,
  )
  .join("\n")}
${room("Living", 18, 18, 592, 402)}
${room("Bedroom", 608, 18, 882, 402)}
<doorOrWindow id="entry" name="Entry door" x="452" y="410" width="95" depth="16" height="215"/>
<doorOrWindow id="bedroom-door" name="Bedroom door" x="600" y="322" width="90" depth="16" height="215" angle="1.5707963267948966"/>
<doorOrWindow id="window" name="Living window" x="220" y="10" width="180" depth="16" height="120" elevation="95"/>
<pieceOfFurniture id="bench" name="Bench" x="515" y="375" width="100" depth="40" height="45"/>
</home>`;
const bytes = zipSync(
  { "Home.xml": strToU8(xml) },
  { mtime: new Date(2020, 0, 1) },
);
const path = new URL("../public/fixtures/", import.meta.url);
writeFileSync(new URL("juniper.sh3d", path), bytes);
const home = furnish(parseSh3d(bytes));
writeFileSync(
  new URL("juniper-v2.fdwz3d", path),
  createProjectArchive({ name: "juniper.sh3d", bytes }, home),
);
