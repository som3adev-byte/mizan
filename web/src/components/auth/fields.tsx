"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; id: string };

/** Label above input. LTR fields (email, codes) set dir="ltr". */
export function Field({ label, id, className = "", ...input }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className={`h-11 rounded-control border border-line bg-surface px-3 text-body outline-none transition-colors placeholder:text-faint hover:border-line-2 focus:border-text ${className}`}
        {...input}
      />
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-badge border border-status-noncompliant-line bg-status-noncompliant-bg px-3 py-2 text-body-sm text-status-noncompliant">
      {children}
    </p>
  );
}

export function SubmitButton({ busy, children, busyLabel }: { busy: boolean; children: ReactNode; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="h-11 w-full rounded-control bg-ink text-body-sm font-semibold text-on-ink transition-colors hover:bg-ink-2 disabled:cursor-wait disabled:opacity-70"
    >
      {busy ? busyLabel : children}
    </button>
  );
}
