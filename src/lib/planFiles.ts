import type { ImportSource } from "./types";
export type PlanKind = "png" | "jpeg" | "pdf";
export type Raster = { bytes: Uint8Array; width: number; height: number };
export const maxUpload = 20_000_000;
export function planKind(bytes: Uint8Array): PlanKind {
  if (bytes.length > maxUpload) throw Error("Choose a floor plan below 20 MB.");
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n))
    return "png";
  if ([255, 216, 255].every((n, i) => bytes[i] === n)) return "jpeg";
  if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") return "pdf";
  throw Error("Choose a valid PNG, JPEG or PDF floor plan.");
}
export function checkPdfPage(pages: number, page: number) {
  if (pages > 50) throw Error("Choose a PDF with no more than 50 pages.");
  if (!Number.isInteger(page) || page < 1 || page > pages)
    throw Error("Select an available PDF page.");
}
function outputSize(width: number, height: number) {
  if (width * height > 25_000_000 || width <= 0 || height <= 0)
    throw Error(
      "The decoded plan exceeds 25 megapixels or has invalid dimensions.",
    );
  const factor = Math.min(1, 2400 / Math.max(width, height));
  return [
    Math.max(1, Math.round(width * factor)),
    Math.max(1, Math.round(height * factor)),
  ];
}
const blob = (bytes: Uint8Array, mime: string) =>
  new Blob([Uint8Array.from(bytes).buffer], { type: mime });
export function dataUrl(
  bytes: Uint8Array,
  mime = "image/png",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("Could not read the preview."));
    reader.readAsDataURL(blob(bytes, mime));
  });
}
export async function preparePlan(
  source: ImportSource,
  page: number,
): Promise<{ raster: Raster; pages: number }> {
  const kind = planKind(source.bytes);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw Error("This browser could not prepare an image.");
  let pages = 1;
  if (kind === "pdf") {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const job = pdfjs.getDocument({
      data: source.bytes.slice(),
      isEvalSupported: false,
      maxImageSize: 25_000_000,
      canvasMaxAreaInBytes: 100_000_000,
    });
    try {
      const pdf = await job.promise;
      pages = pdf.numPages;
      checkPdfPage(pages, page);
      const selected = await pdf.getPage(page);
      const viewport = selected.getViewport({ scale: 1 });
      [canvas.width, canvas.height] = outputSize(
        viewport.width,
        viewport.height,
      );
      await selected.render({
        canvas,
        canvasContext: context,
        viewport: selected.getViewport({
          scale: canvas.width / viewport.width,
        }),
      }).promise;
    } finally {
      await job.destroy();
    }
  } else {
    const image = await createImageBitmap(blob(source.bytes, "image/" + kind));
    try {
      [canvas.width, canvas.height] = outputSize(image.width, image.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } finally {
      image.close();
    }
  }
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(Error("Could not prepare a plan preview.")),
      "image/png",
    ),
  );
  return {
    pages,
    raster: {
      bytes: new Uint8Array(await png.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    },
  };
}

// Keep the exact pixel frame used by the overlay. Re-encode only unusually large raster previews.
export async function analysisImage(raster: Raster): Promise<string> {
  if (raster.bytes.length < 8_000_000) return dataUrl(raster.bytes);
  const image = await createImageBitmap(blob(raster.bytes, "image/png"));
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  try {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw Error("This browser could not prepare the image.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    image.close();
  }
}
