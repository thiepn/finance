import { useState, type FormEvent } from "react";
import type { AskFinanceAnswer } from "../domain/ask-finance.js";
import { Badge, Button, Surface } from "../ui/components/Primitives.js";
import { Icon } from "../ui/icons/Icon.js";
import { useAskFinance } from "./use-ask-finance.js";

const examples = [
  "What did I actually spend last month?",
  "How much did I spend on Snacks at REWE?",
  "Which products increased most in price?",
  "Which expenses still have unmatched receipts?",
  "How much is safe to spend?",
  "What are my monthly subscriptions?",
] as const;

export interface AskFinancePageProps {
  onNavigate?: (key: string) => void;
}

function openEvidenceRoute(
  route: string | null | undefined,
  onNavigate?: (key: string) => void,
) {
  if (!route) return;
  const [key = route] = route.split("?", 1);
  onNavigate?.(key);
  if (typeof window !== "undefined") {
    window.location.hash = route;
  }
}

function AnswerPanel({
  answer,
  onNavigate,
}: {
  answer: AskFinanceAnswer;
  onNavigate?: (key: string) => void;
}) {
  return (
    <div className="f-ask-answer">
      <Surface className="f-ask-answer__hero">
        <div className="f-ask-answer__topline">
          <Badge tone="accent" icon="check">
            Deterministic answer
          </Badge>
          <span>{answer.query.period.label}</span>
        </div>
        <h2>{answer.title}</h2>
        <p>{answer.summary}</p>

        <div className="f-ask-metrics">
          {answer.metrics.map((metric) => (
            <div className="f-ask-metric" key={metric.key}>
              <span>{metric.label}</span>
              <strong
                className={
                  metric.tone && metric.tone !== "default"
                    ? `f-ask-metric__value f-ask-metric__value--${metric.tone}`
                    : "f-ask-metric__value"
                }
              >
                {metric.displayValue}
              </strong>
            </div>
          ))}
        </div>

        {answer.caveat ? (
          <div className="f-ask-caveat">
            <Icon name="alert" size={16} />
            <span>{answer.caveat}</span>
          </div>
        ) : null}
      </Surface>

      <div className="f-ask-answer__grid">
        <Surface className="f-ask-evidence">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">Evidence</span>
              <h2>What this answer is based on</h2>
            </div>
            <span className="f-ask-evidence__count">{answer.evidence.length}</span>
          </div>

          {answer.evidence.length ? (
            <div className="f-ask-evidence__list">
              {answer.evidence.map((item, index) => (
                <button
                  className="f-ask-evidence__row"
                  disabled={!item.route}
                  key={`${item.kind}-${item.id ?? index}`}
                  onClick={() => openEvidenceRoute(item.route, onNavigate)}
                  type="button"
                >
                  <span className="f-ask-evidence__icon">
                    <Icon
                      name={
                        item.kind === "receipt"
                          ? "receipt"
                          : item.kind === "product"
                            ? "products"
                            : item.kind === "merchant"
                              ? "merchants"
                              : item.kind === "category"
                                ? "categories"
                                : item.kind === "account"
                                  ? "accounts"
                                  : item.kind === "budget"
                                    ? "plan"
                                    : item.kind === "recurring"
                                      ? "recurring"
                                      : "activity"
                      }
                      size={16}
                    />
                  </span>
                  <span className="f-ask-evidence__copy">
                    <strong>{item.label}</strong>
                    {item.detail ? <small>{item.detail}</small> : null}
                  </span>
                  {item.route ? <Icon name="chevronRight" size={16} /> : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="f-ask-empty">
              No lower-level evidence rows were needed for this answer.
            </p>
          )}
        </Surface>

        <Surface className="f-ask-provenance">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">Provenance</span>
              <h2>Calculation source</h2>
            </div>
          </div>

          <div className="f-ask-provenance__list">
            {answer.provenance.map((source) => (
              <div className="f-ask-provenance__item" key={source.source}>
                <span className="f-ask-provenance__check">
                  <Icon name="check" size={14} />
                </span>
                <div>
                  <strong>{source.label}</strong>
                  <p>{source.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}

export function AskFinancePage({ onNavigate }: AskFinancePageProps) {
  const { answer, loading, error, connected, ask } = useAskFinance();
  const [question, setQuestion] = useState("");

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const next = question.trim();
    if (!next || loading) return;
    await ask(next);
  };

  const runExample = async (example: string) => {
    setQuestion(example);
    await ask(example);
  };

  return (
    <div className="f-ask-page">
      <div className="f-page-heading f-ask-heading">
        <div>
          <div className="f-page-heading__eyebrow">
            <Badge tone="accent">P19 · Query engine</Badge>
          </div>
          <h1>Ask Finance</h1>
          <p>
            Ask questions about your actual ledger, receipts, products,
            recurring commitments, budgets, and net worth. Finance computes the
            answer deterministically and shows the source data behind it.
          </p>
        </div>
      </div>

      <Surface className="f-ask-composer">
        <form onSubmit={submit}>
          <label htmlFor="ask-finance-question">Question</label>
          <div className="f-ask-composer__input">
            <Icon name="ask" size={20} />
            <textarea
              autoComplete="off"
              disabled={!connected}
              id="ask-finance-question"
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="How much did I actually spend last month?"
              rows={2}
              value={question}
            />
            <Button
              disabled={!connected || loading || !question.trim()}
              size="lg"
              type="submit"
              variant="primary"
            >
              {loading ? "Calculating…" : "Ask"}
            </Button>
          </div>
        </form>

        <div className="f-ask-examples" aria-label="Example questions">
          {examples.map((example) => (
            <button
              disabled={!connected || loading}
              key={example}
              onClick={() => runExample(example)}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="f-ask-trust-row">
          <span>
            <Icon name="check" size={14} />
            Money is calculated from Finance data, not generated by a language
            model.
          </span>
          <span>
            <Icon name="receipt" size={14} />
            Reconciled receipts enrich transactions without double-counting
            them.
          </span>
        </div>
      </Surface>

      {error ? (
        <Surface className="f-ask-error">
          <Icon name="alert" size={18} />
          <div>
            <strong>Could not answer that question</strong>
            <p>{error}</p>
          </div>
        </Surface>
      ) : null}

      {loading ? (
        <Surface className="f-ask-loading">
          <div className="f-ask-loading__pulse" />
          <div>
            <strong>Calculating from Finance</strong>
            <span>Resolving the question and reading authoritative data…</span>
          </div>
        </Surface>
      ) : null}

      {!loading && answer ? (
        <AnswerPanel answer={answer} onNavigate={onNavigate} />
      ) : null}

      {!loading && !answer && !error ? (
        <div className="f-ask-capabilities">
          <Surface>
            <Icon name="insights" size={20} />
            <strong>Spending & cash flow</strong>
            <span>
              Period totals, merchants, categories, necessity, refunds, and
              comparisons.
            </span>
          </Surface>
          <Surface>
            <Icon name="products" size={20} />
            <strong>Products & prices</strong>
            <span>
              Itemized product spend, unit-price changes, and merchant evidence.
            </span>
          </Surface>
          <Surface>
            <Icon name="plan" size={20} />
            <strong>Planning & wealth</strong>
            <span>
              Safe-to-spend, recurring commitments, budgets, savings, and net
              worth.
            </span>
          </Surface>
          <Surface>
            <Icon name="receipts" size={20} />
            <strong>Receipt reconciliation</strong>
            <span>
              Unmatched, suggested, partial, and fully reconciled receipt state.
            </span>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
