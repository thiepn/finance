import type {
  PreparedReceiptImage,
  ReceiptMimeType,
} from "../domain/receipt-capture.js";

const PREPARABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isSupportedReceiptMimeType(value: string): value is ReceiptMimeType {
  return (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp" ||
    value === "image/heic" ||
    value === "image/heif" ||
    value === "application/pdf"
  );
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function prepareReceiptBlob(
  input: Blob,
  options: {
    maxLongEdge?: number;
    jpegQuality?: number;
  } = {},
): Promise<PreparedReceiptImage> {
  if (!isSupportedReceiptMimeType(input.type)) {
    throw new TypeError(`Unsupported receipt file type: ${input.type || "unknown"}`);
  }

  const mimeType = input.type as ReceiptMimeType;
  const sha256 = await sha256Hex(input);

  if (!PREPARABLE_IMAGE_TYPES.has(mimeType)) {
    return {
      blob: input,
      mimeType,
      byteSize: input.size,
      widthPx: null,
      heightPx: null,
      sha256,
    };
  }

  const bitmap = await createImageBitmap(input);
  try {
    const maxLongEdge = options.maxLongEdge ?? 3200;
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Canvas 2D context is unavailable");
    }

    context.drawImage(bitmap, 0, 0, width, height);

    const output = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Image encoding failed"))),
        "image/jpeg",
        options.jpegQuality ?? 0.9,
      );
    });

    return {
      blob: output,
      mimeType: "image/jpeg",
      byteSize: output.size,
      widthPx: width,
      heightPx: height,
      sha256: await sha256Hex(output),
    };
  } finally {
    bitmap.close();
  }
}

export async function openReceiptCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera capture is not supported by this browser");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 2560 },
      height: { ideal: 1920 },
    },
  });
}

export async function captureVideoFrame(
  video: HTMLVideoElement,
  jpegQuality = 0.92,
): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("Camera preview is not ready");
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }

  context.drawImage(video, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Camera capture failed"))),
      "image/jpeg",
      jpegQuality,
    );
  });
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
