import type {
  AskFinanceAnswer,
  AskFinanceQuery,
} from "../domain/ask-finance.js";

export interface FinanceAskService {
  ask(question: string, now?: Date): Promise<AskFinanceAnswer>;
  run(query: AskFinanceQuery): Promise<AskFinanceAnswer>;
}
