import {
  useMemo,
  useState,
} from "react";
import type {
  ReceiptMatchQueueItem,
  ReceiptTransactionMatch,
} from "../domain/receipt-matching.js";
import {
  Badge,
  Button,
  Money,
  ProgressBar,
  Skeleton,
  StatCard,
  Surface,
} from "../ui/components/Primitives.js";
import {
  formatMoneyMinor,
  formatPercent,
} from "../ui/format/money.js";
import { Icon } from "../ui/icons/Icon.js";
import { useReceiptMatchingWorkspace } from "./use-receipt-matching.js";

type QueueFilter =
  | "attention"
  | "unmatched"
  | "suggested"
  | "partial"
  | "matched"
  | "all";

function statusTone(
  status: ReceiptMatchQueueItem["matchStatus"],
): "neutral" | "accent" | "warning" | "positive" {
  if (status === "matched" || status === "multi_payment_matched") {
    return "positive";
  }
  if (status === "suggested_match") return "accent";
  if (status === "partially_matched") return "warning";
  return "neutral";
}

function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toMinor(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value.replace(",", "."));
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function ReceiptMatchingLoading() {
  return (
    <div className="f-receipt-match">
      <Skeleton className="f-overview-skeleton--title" />
      <div className="f-overview-stats">
        {Array.from({ length: 4 }).map((_, index) => (
          <Surface key={index}>
            <Skeleton className="f-overview-skeleton--short" />
            <Skeleton className="f-overview-skeleton--value" />
          </Surface>
        ))}
      </div>
      <Surface>
        <Skeleton className="f-overview-skeleton--panel" />
      </Surface>
    </div>
  );
}

function QueueRow({
  item,
  selected,
  onOpen,
}: {
  item: ReceiptMatchQueueItem;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={
        selected
          ? "f-receipt-match-queue__row f-receipt-match-queue__row--active"
          : "f-receipt-match-queue__row"
      }
      onClick={onOpen}
      type="button"
    >
      <div className="f-receipt-match-queue__identity">
        <div>
          <strong>{item.merchantName}</strong>
          <Badge tone={statusTone(item.matchStatus)}>
            {statusLabel(item.matchStatus)}
          </Badge>
        </div>
        <span>{formatDate(item.purchasedAt)}</span>
        {item.topTransactionDescription ? (
          <small>
            Top candidate: {item.topTransactionDescription}
            {item.topConfidence !== null
              ? ` · ${formatPercent(item.topConfidence, "de-DE", 0)}`
              : ""}
          </small>
        ) : (
          <small>No candidate yet</small>
        )}
      </div>

      <div className="f-receipt-match-queue__amount">
        {item.totalMinor === null ? (
          <span>—</span>
        ) : (
          <Money
            amountMinor={item.totalMinor}
            currencyCode={item.currencyCode}
            locale="de-DE"
          />
        )}
        {item.remainingMinor !== null && item.remainingMinor > 0 ? (
          <small>
            {formatMoneyMinor(
              item.remainingMinor,
              item.currencyCode,
              { locale: "de-DE" },
            )}{" "}
            remaining
          </small>
        ) : null}
      </div>
      <Icon name="chevronRight" size={16} />
    </button>
  );
}

function MatchCard({
  match,
  receiptCurrency,
  remainingMinor,
  busy,
  onConfirm,
  onReject,
}: {
  match: ReceiptTransactionMatch;
  receiptCurrency: string;
  remainingMinor: number | null;
  busy: boolean;
  onConfirm: (amountMinor: number | null) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(
    (match.matchedAmountMinor / 100).toFixed(2),
  );

  const confirmed = match.status === "confirmed";
  const rejected = match.status === "rejected";
  const tx = match.transaction;

  const scoreRows = [
    ["Amount", match.amountScore],
    ["Date", match.dateScore],
    ["Merchant", match.merchantScore],
    ["Currency", match.currencyScore],
  ] as const;

  return (
    <div className="f-receipt-match-card">
      <div className="f-receipt-match-card__header">
        <div>
          <div className="f-receipt-match-card__badges">
            <Badge
              tone={
                confirmed
                  ? "positive"
                  : rejected
                    ? "neutral"
                    : "accent"
              }
            >
              {statusLabel(match.status)}
            </Badge>
            <Badge tone="neutral">
              {tx.source}
            </Badge>
            {match.confidence !== null ? (
              <Badge
                tone={
                  match.confidence >= 0.92
                    ? "positive"
                    : match.confidence >= 0.7
                      ? "accent"
                      : "warning"
                }
              >
                {formatPercent(match.confidence, "de-DE", 0)} confidence
              </Badge>
            ) : null}
          </div>
          <h3>{tx.merchantName ?? tx.description ?? "Expense"}</h3>
          <p>
            {formatDate(tx.occurredAt)}
            {tx.accounts[0]?.name ? ` · ${tx.accounts[0].name}` : ""}
          </p>
        </div>
        <Money
          amountMinor={tx.displayAmountMinor}
          currencyCode={tx.reportingCurrency}
          locale="de-DE"
        />
      </div>

      <div className="f-receipt-match-card__scores">
        {scoreRows.map(([label, score]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {score === null
                ? "—"
                : formatPercent(score, "de-DE", 0)}
            </strong>
          </div>
        ))}
      </div>

      <div className="f-receipt-match-card__evidence">
        <span>
          Amount delta{" "}
          <strong>
            {match.amountDeltaMinor === null
              ? "—"
              : formatMoneyMinor(
                  match.amountDeltaMinor,
                  receiptCurrency,
                  { locale: "de-DE" },
                )}
          </strong>
        </span>
        <span>
          Date delta{" "}
          <strong>
            {match.dateDeltaDays === null
              ? "—"
              : `${match.dateDeltaDays} day${match.dateDeltaDays === 1 ? "" : "s"}`}
          </strong>
        </span>
        {match.decisionSource ? (
          <span>
            Decision <strong>{match.decisionSource}</strong>
          </span>
        ) : null}
      </div>

      {confirmed ? (
        <div className="f-receipt-match-card__actions">
          <span>
            Matched{" "}
            <strong>
              {formatMoneyMinor(
                match.matchedAmountMinor,
                receiptCurrency,
                { locale: "de-DE" },
              )}
            </strong>
          </span>
          <Button
            disabled={busy}
            onClick={() => void onReject()}
            size="sm"
            variant="ghost"
          >
            Unlink
          </Button>
        </div>
      ) : rejected ? (
        <div className="f-receipt-match-card__actions">
          <span>
            {match.decisionNote ?? "Rejected candidate"}
          </span>
        </div>
      ) : (
        <div className="f-receipt-match-card__actions">
          <label>
            <span>Match amount</span>
            <div className="f-receipt-match-money-input">
              <span>{receiptCurrency}</span>
              <input
                inputMode="decimal"
                max={
                  remainingMinor === null
                    ? undefined
                    : (remainingMinor / 100).toFixed(2)
                }
                min="0.01"
                onChange={(event) =>
                  setAmount(event.currentTarget.value)
                }
                step="0.01"
                type="number"
                value={amount}
              />
            </div>
          </label>
          <Button
            disabled={busy}
            onClick={() => void onReject()}
            size="sm"
            variant="ghost"
          >
            Reject
          </Button>
          <Button
            disabled={busy || (toMinor(amount) ?? 0) <= 0}
            onClick={() =>
              void onConfirm(toMinor(amount))
            }
            size="sm"
            variant="primary"
          >
            Confirm match
          </Button>
        </div>
      )}
    </div>
  );
}

export interface ReceiptMatchingPageProps {
  onNavigate: (key: string) => void;
}

export function ReceiptMatchingPage({
  onNavigate,
}: ReceiptMatchingPageProps) {
  const matching = useReceiptMatchingWorkspace();
  const [filter, setFilter] = useState<QueueFilter>("attention");

  if (matching.state === "loading") {
    return <ReceiptMatchingLoading />;
  }

  if (matching.state !== "ready" || !matching.dashboard) {
    return (
      <div className="f-overview-empty">
        <Surface>
          <div className="f-route-foundation__icon">
            <Icon name="receipts" size={22} />
          </div>
          <Badge tone="accent">Receipt matching</Badge>
          <h1>Receipt matching is unavailable.</h1>
          <p>
            {matching.error ??
              "A configured authenticated Finance session is required."}
          </p>
          {matching.state === "error" ? (
            <Button onClick={() => void matching.refresh()}>
              Retry
            </Button>
          ) : null}
        </Surface>
      </div>
    );
  }

  const dashboard = matching.dashboard;
  const items = dashboard.receipts.filter((item) => {
    if (filter === "all") return true;
    if (filter === "attention") {
      return !["matched", "multi_payment_matched"].includes(
        item.matchStatus,
      );
    }
    if (filter === "unmatched") return item.matchStatus === "unmatched";
    if (filter === "suggested") {
      return item.matchStatus === "suggested_match";
    }
    if (filter === "partial") {
      return item.matchStatus === "partially_matched";
    }
    return ["matched", "multi_payment_matched"].includes(
      item.matchStatus,
    );
  });

  const workspace = matching.workspace;
  const receipt = workspace?.receipt ?? null;
  const confirmedMatches =
    workspace?.matches.filter((match) => match.status === "confirmed") ?? [];
  const suggestedMatches =
    workspace?.matches.filter((match) => match.status === "suggested") ?? [];
  const rejectedMatches =
    workspace?.matches.filter((match) => match.status === "rejected") ?? [];

  const coverage =
    receipt?.totalMinor && receipt.totalMinor > 0
      ? Math.min(receipt.coveredMinor / receipt.totalMinor, 1)
      : 0;

  const allocationsByCategory = useMemo(() => {
    const grouped = new Map<
      string,
      {
        label: string;
        necessity: string;
        amount: number;
        currency: string;
      }
    >();

    for (const allocation of workspace?.effectiveAllocations ?? []) {
      const key = `${allocation.categoryId ?? "none"}:${allocation.necessity}`;
      const current = grouped.get(key);
      grouped.set(key, {
        label: allocation.categoryName ?? "Uncategorized",
        necessity: allocation.necessity,
        amount:
          (current?.amount ?? 0) + allocation.reportingAmountMinor,
        currency: allocation.reportingCurrency,
      });
    }

    return Array.from(grouped.values()).sort(
      (a, b) => b.amount - a.amount,
    );
  }, [workspace?.effectiveAllocations]);

  return (
    <div className="f-receipt-match">
      <div className="f-receipt-match-heading">
        <div>
          <div className="f-receipt-match-heading__meta">
            <Badge tone="accent">Reconciliation</Badge>
            <span>Bank movement is truth · receipt explains it</span>
          </div>
          <h1>Match receipts to the money that actually moved.</h1>
          <p>
            Finance scores nearby posted expenses deterministically.
            Exact unique matches can confirm automatically; ambiguous,
            partial and split-payment cases stay under your control.
          </p>
        </div>
        <div className="f-receipt-match-heading__actions">
          <Button
            disabled={matching.busyKey === "queue:refresh"}
            onClick={() => void matching.refreshQueue(true)}
            variant="secondary"
          >
            {matching.busyKey === "queue:refresh"
              ? "Scanning…"
              : "Rescan queue"}
          </Button>
          <Button
            onClick={() => onNavigate("imports")}
            variant="ghost"
          >
            Import bank file
          </Button>
        </div>
      </div>

      {matching.actionError ? (
        <Surface className="f-receipt-match-error">
          <Badge tone="negative">Action failed</Badge>
          <span>{matching.actionError}</span>
        </Surface>
      ) : null}

      <div className="f-overview-stats">
        <StatCard
          label="Suggested"
          supporting="Candidate ready to review"
          value={<span>{dashboard.summary.suggestedCount}</span>}
        />
        <StatCard
          label="Unmatched"
          supporting="No current candidate"
          value={<span>{dashboard.summary.unmatchedCount}</span>}
        />
        <StatCard
          label="Partial"
          supporting="Split payment still open"
          value={<span>{dashboard.summary.partialCount}</span>}
        />
        <StatCard
          label="Matched"
          supporting="Reconciled receipt evidence"
          value={<span>{dashboard.summary.matchedCount}</span>}
        />
      </div>

      <div className="f-receipt-match-layout">
        <Surface className="f-receipt-match-queue">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Receipt queue
              </span>
              <h2>{items.length} visible</h2>
            </div>
          </div>

          <div className="f-receipt-match-filters">
            {(
              [
                ["attention", "Attention"],
                ["suggested", "Suggested"],
                ["unmatched", "Unmatched"],
                ["partial", "Partial"],
                ["matched", "Matched"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => (
              <button
                aria-pressed={filter === key}
                className={
                  filter === key
                    ? "f-receipt-match-filter f-receipt-match-filter--active"
                    : "f-receipt-match-filter"
                }
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="f-receipt-match-queue__list">
            {items.length === 0 ? (
              <div className="f-overview-inline-empty">
                No receipts in this filter.
              </div>
            ) : (
              items.map((item) => (
                <QueueRow
                  item={item}
                  key={item.receiptId}
                  onOpen={() =>
                    void matching.openReceipt(item.receiptId)
                  }
                  selected={
                    item.receiptId === matching.selectedReceiptId
                  }
                />
              ))
            )}
          </div>
        </Surface>

        <div className="f-receipt-match-detail">
          {!workspace || !receipt ? (
            <Surface className="f-receipt-match-empty">
              <Icon name="receipts" size={24} />
              <h2>Select a receipt</h2>
              <p>
                Open a receipt to compare its total, time, merchant and
                item detail against nearby posted expenses.
              </p>
            </Surface>
          ) : (
            <>
              <Surface>
                <div className="f-receipt-match-receipt-head">
                  <div>
                    <div className="f-receipt-match-card__badges">
                      <Badge tone={statusTone(receipt.matchStatus)}>
                        {statusLabel(receipt.matchStatus)}
                      </Badge>
                      {receipt.paymentMethodRaw ? (
                        <Badge tone="neutral">
                          {receipt.paymentMethodRaw}
                        </Badge>
                      ) : null}
                    </div>
                    <h2>{receipt.merchantName}</h2>
                    <p>
                      {formatDate(receipt.purchasedAt)}
                      {receipt.receiptNumber
                        ? ` · Receipt ${receipt.receiptNumber}`
                        : ""}
                    </p>
                  </div>
                  {receipt.totalMinor === null ? (
                    <strong>—</strong>
                  ) : (
                    <Money
                      amountMinor={receipt.totalMinor}
                      currencyCode={receipt.currencyCode}
                      locale="de-DE"
                    />
                  )}
                </div>

                <div className="f-receipt-match-coverage">
                  <ProgressBar
                    detail={
                      receipt.remainingMinor === null
                        ? "Unknown remaining"
                        : receipt.remainingMinor === 0
                          ? "Fully reconciled"
                          : `${formatMoneyMinor(
                              receipt.remainingMinor,
                              receipt.currencyCode,
                              { locale: "de-DE" },
                            )} remaining`
                    }
                    label="Matched coverage"
                    tone={
                      coverage >= 1
                        ? "positive"
                        : coverage > 0
                          ? "accent"
                          : "neutral"
                    }
                    value={coverage}
                  />
                </div>

                <div className="f-receipt-match-inline-actions">
                  <Button
                    disabled={
                      matching.busyKey ===
                      `receipt:${receipt.receiptId}:refresh`
                    }
                    onClick={() =>
                      void matching.refreshReceipt(false)
                    }
                    size="sm"
                    variant="secondary"
                  >
                    Refresh candidates
                  </Button>
                  <Button
                    onClick={matching.clearSelection}
                    size="sm"
                    variant="ghost"
                  >
                    Close
                  </Button>
                </div>
              </Surface>

              {confirmedMatches.length > 0 ? (
                <Surface>
                  <div className="f-section-heading">
                    <div>
                      <span className="f-section-heading__kicker">
                        Confirmed money movement
                      </span>
                      <h2>
                        {confirmedMatches.length} linked transaction
                        {confirmedMatches.length === 1 ? "" : "s"}
                      </h2>
                    </div>
                  </div>
                  <div className="f-receipt-match-cards">
                    {confirmedMatches.map((match) => (
                      <MatchCard
                        busy={
                          matching.busyKey ===
                          `match:${match.matchId}`
                        }
                        key={match.matchId}
                        match={match}
                        onConfirm={(amount) =>
                          matching.confirmMatch(
                            match.matchId,
                            amount,
                          )
                        }
                        onReject={() =>
                          matching.unconfirmMatch(
                            match.matchId,
                            "Unlinked from receipt matching workspace",
                          )
                        }
                        receiptCurrency={receipt.currencyCode}
                        remainingMinor={receipt.remainingMinor}
                      />
                    ))}
                  </div>
                </Surface>
              ) : null}

              <Surface>
                <div className="f-section-heading">
                  <div>
                    <span className="f-section-heading__kicker">
                      Candidate evidence
                    </span>
                    <h2>
                      {suggestedMatches.length} suggested match
                      {suggestedMatches.length === 1 ? "" : "es"}
                    </h2>
                  </div>
                </div>

                {suggestedMatches.length === 0 ? (
                  <div className="f-overview-inline-empty">
                    No suggested transaction currently fits this receipt.
                    Import more bank activity or refresh after new
                    transactions arrive.
                  </div>
                ) : (
                  <div className="f-receipt-match-cards">
                    {suggestedMatches.map((match) => (
                      <MatchCard
                        busy={
                          matching.busyKey ===
                          `match:${match.matchId}`
                        }
                        key={match.matchId}
                        match={match}
                        onConfirm={(amount) =>
                          matching.confirmMatch(
                            match.matchId,
                            amount,
                          )
                        }
                        onReject={() =>
                          matching.rejectMatch(
                            match.matchId,
                            "Rejected in receipt matching workspace",
                          )
                        }
                        receiptCurrency={receipt.currencyCode}
                        remainingMinor={receipt.remainingMinor}
                      />
                    ))}
                  </div>
                )}
              </Surface>

              <div className="f-receipt-match-subgrid">
                <Surface>
                  <div className="f-section-heading">
                    <div>
                      <span className="f-section-heading__kicker">
                        Receipt detail
                      </span>
                      <h2>{workspace.items.length} items</h2>
                    </div>
                  </div>
                  <div className="f-receipt-match-items">
                    {workspace.items.map((item) => (
                      <div
                        className="f-receipt-match-item"
                        key={item.itemId}
                      >
                        <span>
                          <strong>
                            {item.productName ??
                              item.normalizedName ??
                              item.rawName}
                          </strong>
                          <small>
                            {item.categoryName ?? "Uncategorized"}
                            {" · "}
                            {statusLabel(item.necessity)}
                          </small>
                        </span>
                        <Money
                          amountMinor={item.effectiveTotalMinor}
                          currencyCode={receipt.currencyCode}
                          locale="de-DE"
                        />
                      </div>
                    ))}
                  </div>
                </Surface>

                <Surface>
                  <div className="f-section-heading">
                    <div>
                      <span className="f-section-heading__kicker">
                        Effective analytics
                      </span>
                      <h2>Receipt-derived allocation</h2>
                    </div>
                    {allocationsByCategory.length > 0 ? (
                      <Badge tone="positive">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Ledger fallback</Badge>
                    )}
                  </div>

                  {allocationsByCategory.length === 0 ? (
                    <p className="f-receipt-match-note">
                      Receipt categories become the effective analytical
                      classification only after the matched transaction is
                      fully covered. Until then, Finance keeps the original
                      ledger category.
                    </p>
                  ) : (
                    <div className="f-receipt-match-allocations">
                      {allocationsByCategory.map((allocation) => (
                        <div
                          key={`${allocation.label}:${allocation.necessity}`}
                        >
                          <span>
                            <strong>{allocation.label}</strong>
                            <small>
                              {statusLabel(allocation.necessity)}
                            </small>
                          </span>
                          <Money
                            amountMinor={allocation.amount}
                            currencyCode={allocation.currency}
                            locale="de-DE"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </Surface>
              </div>

              {rejectedMatches.length > 0 ? (
                <Surface>
                  <details>
                    <summary>
                      {rejectedMatches.length} rejected candidate
                      {rejectedMatches.length === 1 ? "" : "s"}
                    </summary>
                    <div className="f-receipt-match-rejected">
                      {rejectedMatches.map((match) => (
                        <div key={match.matchId}>
                          <span>
                            {match.transaction.merchantName ??
                              match.transaction.description ??
                              "Expense"}
                          </span>
                          <small>
                            {match.decisionNote ??
                              "Rejected candidate"}
                          </small>
                        </div>
                      ))}
                    </div>
                  </details>
                </Surface>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
