import { expect, it } from "vitest";
import { requireLocalGlb } from "./localGlb";

function glb(manifest: unknown) {
  const json = JSON.stringify(manifest);
  const content = new TextEncoder().encode(
    json.padEnd(Math.ceil(json.length / 4) * 4),
  );
  const bytes = new ArrayBuffer(20 + content.length);
  const view = new DataView(bytes);
  [0x46546c67, 2, bytes.byteLength, content.length, 0x4e4f534a].forEach(
    (value, index) => view.setUint32(index * 4, value, true),
  );
  new Uint8Array(bytes, 20).set(content);
  return bytes;
}
it("accepts embedded GLB resources and rejects external resource references before loading", () => {
  expect(() =>
    requireLocalGlb(
      glb({ asset: { version: "2.0" }, images: [{ bufferView: 0 }] }),
    ),
  ).not.toThrow();
  expect(() =>
    requireLocalGlb(
      glb({ images: [{ uri: "https://example.invalid/texture.png" }] }),
    ),
  ).toThrow("embedded");
  expect(() =>
    requireLocalGlb(glb({ buffers: [{ uri: "../mesh.bin" }] })),
  ).toThrow("embedded");
  expect(() => requireLocalGlb(new ArrayBuffer(8))).toThrow(
    "valid self-contained GLB",
  );
});
