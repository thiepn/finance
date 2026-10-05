import type { UUID } from "../domain/finance.js";
import type { ReceiptPage } from "../domain/receipt-capture.js";
import type {
  ReceiptMultimodalExtractor,
  ReceiptOcrProvider,
  ReceiptProcessingResult,
  ReceiptStructuredParser,
  StructuredReceiptExtraction,
} from "../domain/receipt-processing.js";
import type { FinanceReceiptCaptureService } from "../services/receipt-capture.js";
import type { FinanceReceiptProcessingService } from "../services/receipt-processing.js";

export interface ReceiptProcessingPipelineOptions {
  pipelineVersion?: string;
  fallbackConfidenceThreshold?: number;
  multimodalFallback?: ReceiptMultimodalExtractor;
}

async function digestStrings(values: readonly string[]): Promise<string> {
  const encoded = new TextEncoder().encode(values.join("\n"));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchPrivateBlob(url: string): Promise<Blob> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Receipt page download failed: HTTP ${response.status}`,
    );
  }
  return response.blob();
}

function averageConfidence(
  extraction: StructuredReceiptExtraction,
): number | null {
  const values = extraction.pages
    .map((page) => page.confidence)
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class ReceiptProcessingPipeline {
  private readonly pipelineVersion: string;
  private readonly fallbackConfidenceThreshold: number;

  constructor(
    private readonly captureService: FinanceReceiptCaptureService,
    private readonly processingService: FinanceReceiptProcessingService,
    private readonly ocr: ReceiptOcrProvider,
    private readonly parser: ReceiptStructuredParser,
    private readonly options: ReceiptProcessingPipelineOptions = {},
  ) {
    this.pipelineVersion = options.pipelineVersion ?? "p5-local-1";
    this.fallbackConfidenceThreshold =
      options.fallbackConfidenceThreshold ?? 0.72;
  }

  private async loadPages(
    pages: readonly ReceiptPage[],
  ): Promise<readonly { page: ReceiptPage; blob: Blob }[]> {
    const loaded: { page: ReceiptPage; blob: Blob }[] = [];
    for (const page of [...pages].sort((a, b) => a.pageIndex - b.pageIndex)) {
      const signedUrl = await this.captureService.createPreviewUrl(
        page.storagePath,
        300,
      );
      loaded.push({ page, blob: await fetchPrivateBlob(signedUrl) });
    }
    return loaded;
  }

  async process(receiptId: UUID): Promise<ReceiptProcessingResult> {
    const capture = await this.captureService.get(receiptId);
    if (capture.captureStatus !== "ready") {
      throw new Error("Receipt capture must be finalized before OCR");
    }
    if (!capture.pages.length) {
      throw new Error("Receipt has no pages to process");
    }

    const fallback = this.options.multimodalFallback;
    const locallySupported = capture.pages.every((page) =>
      this.ocr.supports(page.mimeType),
    );

    const mode =
      fallback && !locallySupported
        ? "hybrid"
        : fallback
          ? "hybrid"
          : "local";

    const providerLabel = fallback
      ? `${this.ocr.providerId}+${fallback.providerId}`
      : this.ocr.providerId;
    const modelLabel = fallback
      ? `${this.ocr.modelId}+${fallback.modelId}`
      : this.ocr.modelId;

    const inputDigest = await digestStrings(
      capture.pages.map(
        (page) =>
          page.sha256 ??
          `${page.id}:${page.byteSize}:${page.updatedAt}`,
      ),
    );

    const runId = await this.processingService.begin({
      receiptId,
      mode,
      pipelineVersion: this.pipelineVersion,
      ocrProvider: providerLabel,
      ocrModel: modelLabel,
      parserVersion: this.parser.parserVersion,
      inputDigest,
      metadata: {
        local_parser: this.parser.parserId,
        page_count: capture.pages.length,
      },
    });

    try {
      const loadedPages = await this.loadPages(capture.pages);
      let extraction: StructuredReceiptExtraction;

      if (!locallySupported) {
        if (!fallback) {
          throw new Error(
            "One or more receipt pages require a multimodal fallback because local OCR supports JPEG/PNG/WebP only",
          );
        }
        extraction = await fallback.extract(capture, loadedPages);
      } else {
        const ocrPages = [];
        for (const { page, blob } of loadedPages) {
          ocrPages.push(await this.ocr.recognize(page, blob));
        }

        extraction = this.parser.parse(capture, ocrPages);

        const confidence = averageConfidence(extraction);
        if (
          fallback &&
          confidence !== null &&
          confidence < this.fallbackConfidenceThreshold
        ) {
          extraction = await fallback.extract(capture, loadedPages);
        }
      }

      return await this.processingService.submit(runId, extraction);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.processingService.fail(runId, message, {
        pipeline_version: this.pipelineVersion,
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.ocr.close();
  }
}
