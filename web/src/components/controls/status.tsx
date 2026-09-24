import { useTranslations } from "next-intl";
import type { SVGProps } from "react";
import type { ComplianceStatus } from "@/lib/controls";

/**
 * Status visuals, one place. Every status carries its own shape, so colour is
 * never the only signal.
 */
export const STATUS_STYLE: Record<
  ComplianceStatus,
  { stroke: string; count: string; chip: string; cell: string; bar: string }
> = {
  COMPLIANT: {
    stroke: "text-status-compliant",
    count: "text-status-compliant-text",
    chip: "bg-status-compliant-bg text-status-compliant-text",
    cell: "bg-status-compliant-tile text-on-rail",
    bar: "bg-status-compliant",
  },
  PARTIAL: {
    stroke: "text-status-partial",
    count: "text-status-partial-text",
    chip: "bg-status-partial-bg text-status-partial-text",
    cell: "bg-status-partial-bar text-on-partial",
    bar: "bg-status-partial-bar",
  },
  NON_COMPLIANT: {
    stroke: "text-status-noncompliant",
    count: "text-status-noncompliant",
    chip: "bg-status-noncompliant-bg text-status-noncompliant",
    cell: "bg-status-noncompliant-bar text-on-rail",
    bar: "bg-status-noncompliant-bar",
  },
  NOT_STARTED: {
    stroke: "text-status-notstarted",
    count: "text-text",
    chip: "bg-status-notstarted-bg text-muted",
    cell: "bg-transparent text-status-notstarted",
    bar: "bg-line-2",
  },
  NOT_APPLICABLE: {
    stroke: "text-status-na",
    count: "text-text",
    chip: "bg-status-na-bg text-muted",
    cell: "bg-status-na-bg text-status-na",
    bar: "bg-status-na-bg",
  },
};

/** Round status icon (✓ ◐ ✕ ○ —), drawn in currentColor. */
export function StatusIcon({ status, className = "size-[18px]", ...props }: { status: ComplianceStatus } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 34 34" aria-hidden="true" className={`${STATUS_STYLE[status].stroke} shrink-0 ${className}`} {...props}>
      {status === "NOT_APPLICABLE" ? (
        <circle cx="17" cy="17" r="15" fill="var(--color-status-na-bg)" stroke="currentColor" strokeWidth="2" />
      ) : (
        <circle cx="17" cy="17" r="15" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={status === "NOT_STARTED" ? "4 3" : undefined} />
      )}
      {status === "COMPLIANT" && (
        <path d="M11 17.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {status === "PARTIAL" && <path d="M17 7a10 10 0 0 1 0 20z" fill="currentColor" />}
      {status === "NON_COMPLIANT" && <path d="M12 12l10 10M22 12l-10 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
      {status === "NOT_APPLICABLE" && <path d="M11 17h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
}

/** The small mark inside a control-map cell. */
export function CellMark({ status }: { status: ComplianceStatus }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[70%]">
      {status === "COMPLIANT" && (
        <path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
      )}
      {status === "PARTIAL" && (
        <>
          <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />
        </>
      )}
      {status === "NON_COMPLIANT" && <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      {status === "NOT_STARTED" && (
        <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
      )}
      {status === "NOT_APPLICABLE" && <path d="M4.5 8h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

export function StatusChip({ status }: { status: ComplianceStatus }) {
  const t = useTranslations("Status");
  return (
    <span className={`inline-flex h-6 items-center gap-2 whitespace-nowrap rounded-badge px-2 text-badge font-semibold ${STATUS_STYLE[status].chip}`}>
      <StatusIcon status={status} className="size-4" />
      {t(status)}
    </span>
  );
}

/** Control codes are Latin and LTR even inside Arabic text. */
export function Code({ children, className = "" }: { children: string; className?: string }) {
  return (
    <bdi dir="ltr" className={`font-latin font-medium tabular-nums ${className}`}>
      {children}
    </bdi>
  );
}
