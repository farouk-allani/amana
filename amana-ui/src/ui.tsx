// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** Small presentational primitives shared by the role views. */

import React, { useState } from 'react';

export const Card: React.FC<{
  title?: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, lede, children }) => (
  <div className="card">
    {title && <h2>{title}</h2>}
    {lede && <p className="card-lede">{lede}</p>}
    {children}
  </div>
);

export const Field: React.FC<{
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="field">
    <label>{label}</label>
    {children}
    {hint && <div className="hint">{hint}</div>}
  </div>
);

export const Notice: React.FC<{
  kind: 'error' | 'ok' | 'info';
  children: React.ReactNode;
}> = ({ kind, children }) => <div className={`notice ${kind}`}>{children}</div>;

export const Badge: React.FC<{
  kind: 'live' | 'dead' | 'neutral' | 'gold';
  children: React.ReactNode;
}> = ({ kind, children }) => <span className={`badge ${kind}`}>{children}</span>;

export const Stat: React.FC<{ n: React.ReactNode; l: string }> = ({ n, l }) => (
  <div className="stat">
    <div className="n">{n}</div>
    <div className="l">{l}</div>
  </div>
);

export const KV: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <div className="kv">
    <span className="k">{k}</span>
    <span className="v">{children}</span>
  </div>
);

/** A hash, shortened, with a click-to-copy affordance. */
export const Hash: React.FC<{ value: string; full?: boolean }> = ({ value, full = false }) => {
  const [copied, setCopied] = useState(false);
  const shown = full || value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-8)}`;

  return (
    <span
      className="hash"
      title={`${value} — click to copy`}
      style={{ cursor: 'pointer' }}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? 'copied' : shown}
    </span>
  );
};

/** A button that shows progress and surfaces whatever the chain complained about. */
export const ActionButton: React.FC<{
  label: string;
  busyLabel?: string;
  kind?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  tiny?: boolean;
  onRun: () => Promise<void>;
  onError?: (message: string) => void;
  onDone?: (message: string) => void;
  doneMessage?: string;
}> = ({
  label,
  busyLabel,
  kind = 'primary',
  disabled,
  tiny,
  onRun,
  onError,
  onDone,
  doneMessage,
}) => {
  const [busy, setBusy] = useState(false);

  return (
    <button
      className={`btn ${kind}${tiny ? ' tiny' : ''}`}
      disabled={busy || disabled}
      onClick={() => {
        setBusy(true);
        onError?.('');
        void onRun()
          .then(() => {
            if (doneMessage) onDone?.(doneMessage);
          })
          .catch((e: unknown) => onError?.(describe(e)))
          .finally(() => setBusy(false));
      }}
    >
      {busy && <span className="spinner" />}
      {busy ? (busyLabel ?? 'Working…') : label}
    </button>
  );
};

/**
 * Turn a thrown value into something a person can act on.
 *
 * Circuit assertion failures arrive as `failed assert: <the message we wrote
 * in Compact>`. Those messages were written for humans, so the prefix is
 * stripped and the sentence shown as-is rather than buried under a stack
 * trace.
 */
export const describe = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : String(e);
  const assertion = /failed assert:\s*(.+)/.exec(raw);
  if (assertion?.[1]) {
    const sentence = assertion[1].trim();
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }
  return raw;
};
