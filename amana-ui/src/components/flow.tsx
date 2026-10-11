// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** The protocol stepper and the progress panel for on-chain operations. */

import React, { useEffect, useState } from 'react';
import { Check, CircleCheck, CircleX, RotateCcw } from 'lucide-react';

import { explainError } from '../errors.js';
import { TX_STAGES, useTransaction, type TxStage, type TxStatus } from '../transactions.js';
import { Button, Spinner } from './controls.jsx';
import { Dialog } from './surfaces.jsx';
import './flow.css';

// --- stepper ---------------------------------------------------------------

export type StepState = 'done' | 'current' | 'waiting' | 'upcoming';

export type StepItem = {
  readonly label: string;
  /** Whose move it is: "You", "Verifier", "Borrower". */
  readonly who: string;
  readonly state: StepState;
};

/**
 * Where a check stands, for one participant. `current` is your move;
 * `waiting` is the other party's.
 */
export const Stepper: React.FC<{ steps: readonly StepItem[]; label?: string }> = ({
  steps,
  label = 'Progress',
}) => {
  const activeIndex = steps.findIndex((s) => s.state === 'current' || s.state === 'waiting');
  const active = activeIndex >= 0 ? steps[activeIndex] : undefined;
  const allDone = steps.every((s) => s.state === 'done');
  return (
    <nav className="stepper" aria-label={label}>
      <ol className="stepper-list">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={`stepper-step is-${s.state}`}
            aria-current={s.state === 'current' || s.state === 'waiting' ? 'step' : undefined}
          >
            <span className="stepper-marker" aria-hidden>
              {s.state === 'done' ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span className="stepper-text">
              <span className="stepper-label">{s.label}</span>
              <span className="stepper-who">
                {s.state === 'waiting' ? `Waiting for ${s.who.toLowerCase()}` : s.who}
              </span>
            </span>
            <span className="visually-hidden">
              {s.state === 'done' ? ' (done)' : s.state === 'upcoming' ? ' (not started)' : ''}
            </span>
          </li>
        ))}
      </ol>
      {/* The compact form, for narrow screens. */}
      <div className="stepper-compact" aria-hidden>
        <div className="stepper-bars">
          {steps.map((s) => (
            <span key={s.label} className={`stepper-bar is-${s.state}`} />
          ))}
        </div>
        <p className="stepper-compact-text">
          {allDone ? (
            <>
              <b>All five steps done</b>
            </>
          ) : active ? (
            <>
              <span className="stepper-compact-count">
                Step {activeIndex + 1} of {steps.length}
              </span>{' '}
              <b>{active.label}</b>{' '}
              <span className="stepper-compact-who">
                · {active.state === 'waiting' ? `waiting for ${active.who.toLowerCase()}` : active.who}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </nav>
  );
};

// --- transaction progress --------------------------------------------------

type StageCopy = { readonly label: string; readonly detail: string };

const DEFAULT_STAGES: Record<TxStage, StageCopy> = {
  prepare: { label: 'Preparing', detail: 'Running the contract logic on this device.' },
  prove: {
    label: 'Building the zero-knowledge proof',
    detail: 'Your proof server is computing it. This is the long step.',
  },
  approve: {
    label: 'Confirming in Lace',
    detail: 'Lace balances the transaction and pays the fee. Approve it if Lace asks.',
  },
  submit: { label: 'Submitting to Midnight', detail: 'Sending the proven transaction to the network.' },
  confirm: { label: 'Waiting for confirmation', detail: 'The network is including it in a block.' },
};

const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
};

/**
 * What an on-chain operation is doing right now.
 *
 * Shows the five real stages, the elapsed time against the usual time, and
 * on failure the stage it stopped at with a plain explanation.
 */
export const TxProgress: React.FC<{
  status: TxStatus;
  title: string;
  /** Typical duration, so a long wait reads as normal. */
  expectedSeconds: number;
  stages?: Partial<Record<TxStage, Partial<StageCopy>>>;
  successTitle?: React.ReactNode;
  successBody?: React.ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
}> = ({ status, title, expectedSeconds, stages, successTitle, successBody, onRetry, onDismiss }) => {
  const now = useNow(status.phase === 'running');
  if (status.phase === 'idle') return null;

  const copy = (stage: TxStage): StageCopy => ({ ...DEFAULT_STAGES[stage], ...stages?.[stage] });
  const current: TxStage | null = status.phase === 'running' || status.phase === 'failed' ? status.stage : null;
  const currentIndex = status.phase === 'done' ? TX_STAGES.length : current ? TX_STAGES.indexOf(current) : 0;
  const elapsed = (status.phase === 'running' ? now : status.finishedAt) - status.startedAt;

  if (status.phase === 'done') {
    return (
      <div className="tx tx-done" role="status">
        <span className="tx-done-icon" aria-hidden>
          <CircleCheck size={22} />
        </span>
        <div className="tx-done-body">
          <p className="tx-title">{successTitle ?? 'Confirmed on chain'}</p>
          {successBody && <div className="tx-done-text">{successBody}</div>}
          <p className="tx-meta num">Took {clock(elapsed)}</p>
        </div>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Done
          </Button>
        )}
      </div>
    );
  }

  const failed = status.phase === 'failed';
  const explained = failed ? explainError(status.error) : null;

  return (
    <div className={`tx${failed ? ' tx-failed' : ''}`} role={failed ? 'alert' : 'status'} aria-live="polite">
      <div className="tx-head">
        <span className="tx-head-icon" aria-hidden>
          {failed ? <CircleX size={20} /> : <Spinner size={18} />}
        </span>
        <div className="tx-head-text">
          <p className="tx-title">{failed ? explained!.title : title}</p>
          <p className="tx-meta num">
            {failed ? (
              <>Stopped at “{copy(status.stage).label.toLowerCase()}” after {clock(elapsed)}</>
            ) : (
              <>
                {clock(elapsed)} elapsed · usually about {expectedSeconds} seconds
              </>
            )}
          </p>
        </div>
      </div>

      <div className="tx-bar" aria-hidden>
        {TX_STAGES.map((stage, i) => (
          <span
            key={stage}
            className={`tx-bar-seg${i < currentIndex ? ' is-done' : ''}${i === currentIndex ? (failed ? ' is-failed' : ' is-active') : ''}`}
          />
        ))}
      </div>

      <ol className="tx-stages">
        {TX_STAGES.map((stage, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? (failed ? 'failed' : 'active') : 'upcoming';
          const c = copy(stage);
          return (
            <li key={stage} className={`tx-stage is-${state}`}>
              <span className="tx-stage-marker" aria-hidden>
                {state === 'done' ? (
                  <Check size={13} strokeWidth={3} />
                ) : state === 'active' ? (
                  <Spinner size={13} />
                ) : state === 'failed' ? (
                  <CircleX size={14} />
                ) : null}
              </span>
              <span className="tx-stage-text">
                <span className="tx-stage-label">
                  {c.label}
                  <span className="visually-hidden">
                    {state === 'done' ? ', done' : state === 'active' ? ', in progress' : state === 'failed' ? ', failed' : ''}
                  </span>
                </span>
                {state === 'active' && <span className="tx-stage-detail">{c.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {failed ? (
        <div className="tx-failure">
          {explained!.body && <p>{explained!.body}</p>}
          {explained!.raw && explained!.raw !== explained!.title && (
            <details className="alert-details">
              <summary>Technical details</summary>
              <pre>{explained!.raw}</pre>
            </details>
          )}
          <div className="tx-failure-actions">
            {onRetry && (
              <Button variant="secondary" size="sm" icon={<RotateCcw size={14} aria-hidden />} onClick={onRetry}>
                Try again
              </Button>
            )}
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="tx-foot">Keep this page open until it is confirmed.</p>
      )}
    </div>
  );
};

// --- confirm, then transact ------------------------------------------------

/**
 * A dialog that asks first, then runs one on-chain operation and shows its
 * progress in place. It cannot be dismissed while the operation runs.
 */
export const TxDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  confirmLabel: string;
  cancelLabel?: string;
  /** False while the form inside is incomplete. */
  canConfirm?: boolean;
  run: () => Promise<unknown>;
  progressTitle: string;
  expectedSeconds: number;
  successTitle: React.ReactNode;
  successBody?: React.ReactNode;
  /** Called once the operation has succeeded. */
  onDone?: () => void;
  children?: React.ReactNode;
}> = ({
  open,
  onClose,
  title,
  description,
  icon,
  tone = 'default',
  confirmLabel,
  cancelLabel = 'Cancel',
  canConfirm = true,
  run,
  progressTitle,
  expectedSeconds,
  successTitle,
  successBody,
  onDone,
  children,
}) => {
  const tx = useTransaction();
  const close = () => {
    if (tx.status.phase === 'running') return;
    tx.reset();
    onClose();
  };
  const go = () => void tx.run(run);

  useEffect(() => {
    if (tx.status.phase === 'done') onDone?.();
    // Only when an operation completes.
  }, [tx.status.phase]);

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      dismissible={tx.status.phase !== 'running'}
      footer={
        tx.status.phase === 'idle' ? (
          <>
            <Button variant="ghost" onClick={close}>
              {cancelLabel}
            </Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={!canConfirm} onClick={go}>
              {confirmLabel}
            </Button>
          </>
        ) : tx.status.phase === 'running' ? null : (
          <Button onClick={close}>Close</Button>
        )
      }
    >
      {tx.status.phase === 'idle' ? (
        children
      ) : (
        <TxProgress
          status={tx.status}
          title={progressTitle}
          expectedSeconds={expectedSeconds}
          successTitle={successTitle}
          successBody={successBody}
          onRetry={go}
        />
      )}
    </Dialog>
  );
};
