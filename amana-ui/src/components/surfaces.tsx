// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** Panels, status, alerts, empty states, technical details and dialogs. */

import React, { useEffect, useId, useRef } from 'react';
import { ChevronDown, CircleAlert, CircleCheck, CodeXml, Info, TriangleAlert, X } from 'lucide-react';

import { explainError } from '../errors.js';
import { CopyButton, IconButton } from './controls.jsx';
import './surfaces.css';

// --- panel -----------------------------------------------------------------

export const Panel: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** `raised` for the one panel that matters most on a screen. */
  tone?: 'default' | 'raised' | 'inset';
  className?: string;
  id?: string;
  children?: React.ReactNode;
}> = ({ title, description, icon, actions, tone = 'default', className, id, children }) => {
  const headingId = useId();
  return (
    <section
      id={id}
      className={`panel panel-${tone} ${className ?? ''}`}
      aria-labelledby={title ? headingId : undefined}
    >
      {(title || actions) && (
        <header className="panel-head">
          {icon && (
            <span className="panel-icon" aria-hidden>
              {icon}
            </span>
          )}
          <div className="panel-titles">
            {title && (
              <h2 className="panel-title" id={headingId}>
                {title}
              </h2>
            )}
            {description && <p className="panel-description">{description}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children !== undefined && <div className="panel-body">{children}</div>}
    </section>
  );
};

/** A page heading with an optional eyebrow, lede and actions. */
export const PageHeader: React.FC<{
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, lede, actions }) => (
  <header className="page-header">
    <div className="page-header-text">
      {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
      <h1 className="page-title">{title}</h1>
      {lede && <p className="page-lede">{lede}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
);

// --- status ----------------------------------------------------------------

export type Tone = 'live' | 'revoked' | 'pending' | 'neutral' | 'info' | 'gold';

export const StatusPill: React.FC<{ tone: Tone; children: React.ReactNode; pulse?: boolean }> = ({
  tone,
  children,
  pulse = false,
}) => (
  <span className={`pill pill-${tone}${pulse ? ' pill-pulse' : ''}`}>
    <span className="pill-dot" aria-hidden />
    {children}
  </span>
);

export const Metric: React.FC<{
  value: React.ReactNode;
  label: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ value, label, sub, icon }) => (
  <div className="metric">
    <div className="metric-top">
      <span className="metric-label">{label}</span>
      {icon && (
        <span className="metric-icon" aria-hidden>
          {icon}
        </span>
      )}
    </div>
    <div className="metric-value num">{value}</div>
    {sub && <div className="metric-sub">{sub}</div>}
  </div>
);

/** Label and value rows: the plain facts of an object. */
export const Facts: React.FC<{ items: readonly { label: React.ReactNode; value: React.ReactNode }[] }> = ({
  items,
}) => (
  <dl className="facts">
    {items.map((item, i) => (
      <div className="facts-row" key={i}>
        <dt>{item.label}</dt>
        <dd>{item.value}</dd>
      </div>
    ))}
  </dl>
);

// --- alerts ----------------------------------------------------------------

const ALERT_ICON = {
  error: <CircleAlert size={18} />,
  warning: <TriangleAlert size={18} />,
  success: <CircleCheck size={18} />,
  info: <Info size={18} />,
};

export const Alert: React.FC<{
  tone?: 'error' | 'warning' | 'success' | 'info';
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Raw detail, shown behind a disclosure. */
  details?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
}> = ({ tone = 'info', title, children, details, action, onDismiss }) => (
  <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <span className="alert-icon" aria-hidden>
      {ALERT_ICON[tone]}
    </span>
    <div className="alert-body">
      {title && <p className="alert-title">{title}</p>}
      {children && <div className="alert-text">{children}</div>}
      {details && (
        <details className="alert-details">
          <summary>Technical details</summary>
          <pre>{details}</pre>
        </details>
      )}
      {action && <div className="alert-action">{action}</div>}
    </div>
    {onDismiss && (
      <IconButton label="Dismiss" className="alert-dismiss" onClick={onDismiss}>
        <X size={16} aria-hidden />
      </IconButton>
    )}
  </div>
);

/** Any thrown value, explained in plain language with the raw message kept. */
export const ErrorAlert: React.FC<{ error: unknown; onDismiss?: () => void; action?: React.ReactNode }> = ({
  error,
  onDismiss,
  action,
}) => {
  const e = explainError(error);
  return (
    <Alert
      tone="error"
      title={e.title}
      details={e.raw && e.raw !== e.title ? e.raw : undefined}
      onDismiss={onDismiss}
      action={action}
    >
      {e.body || undefined}
    </Alert>
  );
};

// --- empty states ----------------------------------------------------------

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, title, children, action }) => (
  <div className="empty-state">
    <span className="empty-state-icon" aria-hidden>
      {icon}
    </span>
    <p className="empty-state-title">{title}</p>
    {children && <div className="empty-state-text">{children}</div>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>
);

// --- technical details -----------------------------------------------------

/**
 * Hashes, keys and indexes, out of the way until someone asks for them.
 * A native `<details>`, so it is keyboard and screen-reader friendly as-is.
 */
export const TechDetails: React.FC<{
  summary?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: 'dark' | 'paper';
}> = ({ summary = 'Technical details', children, defaultOpen = false, tone = 'dark' }) => (
  <details className={`tech tech-${tone}`} open={defaultOpen}>
    <summary>
      <CodeXml size={15} aria-hidden />
      <span>{summary}</span>
      <ChevronDown size={15} className="tech-chevron" aria-hidden />
    </summary>
    <dl className="tech-list">{children}</dl>
  </details>
);

export const TechRow: React.FC<{
  label: string;
  value: string;
  /** Plain-language note on what this value is. */
  note?: React.ReactNode;
  copy?: boolean;
}> = ({ label, value, note, copy = true }) => (
  <div className="tech-row">
    <dt>
      {label}
      {note && <span className="tech-note">{note}</span>}
    </dt>
    <dd>
      <code>{value}</code>
      {copy && <CopyButton compact value={value} label={`Copy ${label.toLowerCase()}`} />}
    </dd>
  </div>
);

// --- dialogs ---------------------------------------------------------------

/**
 * A modal dialog on the native `<dialog>` element, which traps focus, closes
 * on Escape and restores focus to the opener without any help.
 */
export const Dialog: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** False while something must finish: no close button, Escape or backdrop. */
  dismissible?: boolean;
  children?: React.ReactNode;
}> = ({ open, onClose, title, description, icon, tone = 'default', footer, size = 'md', dismissible = true, children }) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size} dialog-${tone}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-head">
          {icon && (
            <span className="dialog-icon" aria-hidden>
              {icon}
            </span>
          )}
          <div className="dialog-titles">
            <h2 id={titleId} className="dialog-title">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="dialog-description">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <IconButton label="Close" onClick={onClose} className="dialog-close">
              <X size={18} aria-hidden />
            </IconButton>
          )}
        </header>
        {children && <div className="dialog-body">{children}</div>}
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </dialog>
  );
};
