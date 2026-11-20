import { LoadingManager } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function requireLocalGlb(bytes: ArrayBuffer) {
  const data = new DataView(bytes);
  if (
    bytes.byteLength < 20 ||
    bytes.byteLength > 50_000_000 ||
    data.getUint32(0, true) !== 0x46546c67 ||
    data.getUint32(4, true) !== 2 ||
    data.getUint32(8, true) !== bytes.byteLength ||
    data.getUint32(16, true) !== 0x4e4f534a
  )
    throw Error("Use a valid self-contained GLB below 50 MB.");
  const length = data.getUint32(12, true);
  if (length > bytes.byteLength - 20 || length > 10_000_000)
    throw Error("Invalid or oversized GLB metadata.");
  const manifest = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, length)),
  );
  const pending = [manifest];
  while (pending.length) {
    const item: unknown = pending.pop();
    if (!item || typeof item !== "object") continue;
    for (const [name, value] of Object.entries(item)) {
      if (
        name === "uri" &&
        typeof value === "string" &&
        !/^data:(?:application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp|ktx2));base64,/i.test(
          value,
        )
      )
        throw Error("GLB resources must be embedded.");
      if (value && typeof value === "object") pending.push(value);
    }
  }
}

export function loadLocalGlb(bytes: ArrayBuffer) {
  requireLocalGlb(bytes);
  const manager = new LoadingManager();
  // The loader creates blob URLs for images stored in buffer views.
  manager.setURLModifier((url) => {
    if (/^(blob:|data:)/.test(url)) return url;
    throw Error("External model resources are disabled.");
  });
  return new GLTFLoader(manager).parseAsync(bytes, "");
}
