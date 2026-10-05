import { createWorker } from "tesseract.js";
import type {
  ReceiptOcrPage,
  ReceiptOcrProvider,
} from "../domain/receipt-processing.js";
import type { ReceiptMimeType, ReceiptPage } from "../domain/receipt-capture.js";

const LOCAL_IMAGE_TYPES = new Set<ReceiptMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export class TesseractReceiptOcrProvider implements ReceiptOcrProvider {
  readonly providerId = "tesseract.js";
  readonly modelId = "7.0.0-deu+eng";

  private workerPromise: ReturnType<typeof createWorker> | null = null;

  constructor(
    private readonly languages: readonly string[] = ["deu", "eng"],
  ) {}

  supports(mimeType: ReceiptMimeType): boolean {
    return LOCAL_IMAGE_TYPES.has(mimeType);
  }

  private getWorker(): ReturnType<typeof createWorker> {
    if (!this.workerPromise) {
      this.workerPromise = createWorker([...this.languages]);
    }
    return this.workerPromise;
  }

  async recognize(page: ReceiptPage, image: Blob): Promise<ReceiptOcrPage> {
    if (!this.supports(page.mimeType)) {
      throw new Error(
        `Local OCR does not support ${page.mimeType}; use a multimodal fallback`,
      );
    }

    const worker = await this.getWorker();
    const result = await worker.recognize(image, { rotateAuto: true });
    const confidence =
      Number.isFinite(result.data.confidence) && result.data.confidence >= 0
        ? Math.min(1, Math.max(0, result.data.confidence / 100))
        : null;

    return {
      pageId: page.id,
      pageIndex: page.pageIndex,
      rawText: result.data.text ?? "",
      confidence,
      metadata: {
        language: this.languages.join("+"),
        engine: this.providerId,
        model: this.modelId,
      },
    };
  }

  async close(): Promise<void> {
    const promise = this.workerPromise;
    this.workerPromise = null;
    if (promise) {
      const worker = await promise;
      await worker.terminate();
    }
  }
}
