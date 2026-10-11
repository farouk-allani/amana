// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** Buttons, form fields and the copy affordance. */

import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, CircleAlert, Copy, Minus, Plus } from 'lucide-react';

import './controls.css';

// --- buttons ---------------------------------------------------------------

export const Spinner: React.FC<{ size?: number; label?: string }> = ({ size = 16, label }) => (
  <span
    className="spin"
    style={{ width: size, height: size }}
    role={label ? 'status' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  />
);

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and marks it busy. */
  loading?: boolean;
  icon?: React.ReactNode;
  iconEnd?: React.ReactNode;
  block?: boolean;
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconEnd,
  block = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={[
      'button',
      `button-${variant}`,
      `button-${size}`,
      block ? 'button-block' : '',
      className ?? '',
    ].join(' ')}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    {loading ? <Spinner size={size === 'sm' ? 13 : 15} /> : icon}
    {children !== undefined && <span className="button-label">{children}</span>}
    {!loading && iconEnd}
  </button>
);

/**
 * A button for a quick asynchronous step, such as deriving a key locally.
 * On-chain operations use `useTransaction` and the progress panel instead.
 */
export const AsyncButton: React.FC<
  Omit<ButtonProps, 'onClick' | 'loading'> & {
    onRun: () => Promise<void>;
    onError?: (e: unknown) => void;
  }
> = ({ onRun, onError, ...props }) => {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <Button
      {...props}
      loading={busy}
      onClick={() => {
        setBusy(true);
        onRun()
          .catch((e: unknown) => onError?.(e))
          .finally(() => mounted.current && setBusy(false));
      }}
    />
  );
};

export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: React.ReactNode }
> = ({ label, children, className, type = 'button', ...rest }) => (
  <button type={type} className={`icon-button ${className ?? ''}`} aria-label={label} title={label} {...rest}>
    {children}
  </button>
);

// --- copying ---------------------------------------------------------------

const writeClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API refused (insecure origin, permissions): fall back.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
};

export const CopyButton: React.FC<{
  value: string;
  /** What is being copied, for the accessible name: "Copy check ID". */
  label?: string;
  /** Icon only. */
  compact?: boolean;
  variant?: 'ghost' | 'secondary';
}> = ({ value, label = 'Copy', compact = false, variant = 'ghost' }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={`copy-button copy-${variant}${compact ? ' copy-compact' : ''}${copied ? ' is-copied' : ''}`}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      onClick={() => {
        void writeClipboard(value).then(() => {
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {!compact && <span>{copied ? 'Copied' : label}</span>}
      <span className="visually-hidden" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
};

/** Shorten a long hexadecimal value for display: 0x7c2e41…9a03bd. */
export const shortHex = (value: string, head = 8, tail = 6): string =>
  value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;

/**
 * A value the person has to send to someone else, such as a response key.
 * Shown in full so it can be checked by eye, with one obvious copy button.
 */
export const ShareValue: React.FC<{ label: string; value: string; hint?: React.ReactNode }> = ({
  label,
  value,
  hint,
}) => (
  <div className="share-value">
    <div className="share-value-head">
      <span className="share-value-label">{label}</span>
      <CopyButton value={value} label="Copy" variant="secondary" />
    </div>
    <code className="share-value-code">{value}</code>
    {hint && <p className="share-value-hint">{hint}</p>}
  </div>
);

// --- fields ----------------------------------------------------------------

type FieldChildProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

/**
 * A labelled form control. The single child receives the id and the
 * description wiring, so the label, hint and error are announced together.
 */
export const Field: React.FC<{
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactElement<FieldChildProps>;
}> = ({ label, hint, error, optional, className, children }) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field${error ? ' has-error' : ''} ${className ?? ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="field-optional">Optional</span>}
      </label>
      {React.cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          <CircleAlert size={14} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }> = ({
  mono,
  className,
  ...rest
}) => <input className={`input${mono ? ' input-mono' : ''} ${className ?? ''}`} {...rest} />;

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }> = ({
  mono,
  className,
  ...rest
}) => <textarea className={`input textarea${mono ? ' input-mono' : ''} ${className ?? ''}`} {...rest} />;

/** A whole-number input with large step buttons, for thresholds and counts. */
export const NumberInput: React.FC<
  FieldChildProps & {
    value: string;
    onChange: (value: string) => void;
    min?: number;
    max?: number;
    unit?: string;
  }
> = ({ value, onChange, min = 0, max = 65535, unit, ...aria }) => {
  const n = /^\d+$/.test(value) ? Number(value) : null;
  const step = (d: number) => onChange(String(Math.min(max, Math.max(min, (n ?? min) + d))));
  return (
    <div className="number-input">
      <IconButton label="Decrease" onClick={() => step(-1)} disabled={n !== null && n <= min}>
        <Minus size={16} aria-hidden />
      </IconButton>
      <input
        className="input number-input-field num"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        {...aria}
      />
      {unit && <span className="number-input-unit">{unit}</span>}
      <IconButton label="Increase" onClick={() => step(1)} disabled={n !== null && n >= max}>
        <Plus size={16} aria-hidden />
      </IconButton>
    </div>
  );
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A month picker over Amana's period index, (year − 1970) × 12 + month.
 * Two selects rather than `<input type="month">`, which some browsers lack.
 */
export const MonthInput: React.FC<
  FieldChildProps & {
    value: bigint;
    onChange: (period: bigint) => void;
    fromYear?: number;
    toYear?: number;
  }
> = ({ value, onChange, fromYear = 2015, toYear = new Date().getUTCFullYear() + 1, id, ...aria }) => {
  const n = Number(value);
  const year = 1970 + Math.floor(n / 12);
  const month = n % 12;
  const years: number[] = [];
  for (let y = toYear; y >= Math.min(fromYear, year); y--) years.push(y);
  const set = (y: number, m: number) => onChange(BigInt((y - 1970) * 12 + m));
  return (
    <div className="month-input">
      <select className="input select" id={id} value={month} onChange={(e) => set(year, Number(e.target.value))} {...aria}>
        {MONTHS.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </select>
      <select className="input select" aria-label="Year" value={year} onChange={(e) => set(Number(e.target.value), month)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
};

/** A small set of mutually exclusive options, as real radio buttons. */
export const ChoiceChips = <T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) => {
  const name = useId();
  return (
    <fieldset className="chips">
      <legend className="field-label">{legend}</legend>
      <div className="chips-row">
        {options.map((o) => (
          <label key={o.value} className={`chip${value === o.value ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};
