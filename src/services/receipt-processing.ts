import type { UUID } from "../domain/finance.js";
import type {
  ReceiptPipelineMode,
  ReceiptProcessingResult,
  StructuredReceiptExtraction,
} from "../domain/receipt-processing.js";

export interface BeginReceiptProcessingInput {
  receiptId: UUID;
  mode: ReceiptPipelineMode;
  pipelineVersion: string;
  ocrProvider: string;
  ocrModel: string;
  parserVersion: string;
  inputDigest?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FinanceReceiptProcessingService {
  begin(input: BeginReceiptProcessingInput): Promise<UUID>;
  submit(
    runId: UUID,
    extraction: StructuredReceiptExtraction,
  ): Promise<ReceiptProcessingResult>;
  fail(
    runId: UUID,
    errorText: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  get(receiptId: UUID): Promise<ReceiptProcessingResult>;
}
