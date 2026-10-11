// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The verifying institution: ask an applicant one question about their
 * repayment record, and read a yes backed by a proof.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileSearch, History, Plus, RefreshCw, ShieldCheck, Upload } from 'lucide-react';

import type { AmanaDerivedState, CheckDraft, CheckOutcome } from '../../../../api/src/index.js';
import { utils } from '../../../../api/src/index.js';
import { EXPECTED_SECONDS, useAppContext, type AmanaClient } from '../../client.js';
import {
  Alert,
  AsyncButton,
  Button,
  ChoiceChips,
  EmptyState,
  ErrorAlert,
  Field,
  Input,
  NumberInput,
  PageHeader,
  Panel,
  Receipt,
  ShareValue,
  Spinner,
  StatusPill,
  Stepper,
  TechDetails,
  TechRow,
  TxProgress,
  shortHex,
  type StepItem,
} from '../../components/index.js';
import { month, remember, span } from '../../format.js';
import { useTransaction } from '../../transactions.js';
import { LookupDialog } from './LookupDialog.jsx';
import './verifier.css';

/** A check this device drafted. Public values only. */
type SavedCheck = {
  readonly draft: CheckDraft;
  readonly minOnTime: string;
  readonly minPeriod: string;
  readonly maxPeriod: string;
  readonly createdAt?: number;
};

const isSaved = (s: unknown): s is SavedCheck => {
  const c = s as SavedCheck | null;
  return (
    !!c &&
    !!c.draft &&
    utils.isHex32(c.draft.checkId) &&
    utils.isHex32(c.draft.nonce) &&
    utils.parseUint(c.minOnTime) !== null &&
    utils.parseUint(c.minPeriod, 32) !== null &&
    utils.parseUint(c.maxPeriod, 32) !== null
  );
};

const read = <T,>(key: string, check: (v: unknown) => v is T): T | null => {
  try {
    const v = JSON.parse(remember.get(key) ?? 'null') as unknown;
    return check(v) ? v : null;
  } catch {
    return null;
  }
};

const readHistory = (key: string): SavedCheck[] => {
  try {
    const v = JSON.parse(remember.get(key) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(isSaved) : [];
  } catch {
    return [];
  }
};

const WINDOWS = [
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: '24', label: '24 months' },
  { value: '36', label: '36 months' },
] as const;
type WindowMonths = (typeof WINDOWS)[number]['value'];

const POLL_MS = 15_000;

const NOT_TOLD = ['The applicant’s exact number of repayments', 'Which institutions contributed', 'How many records were used'];

export const VerifierView: React.FC<{ api: AmanaClient; state: AmanaDerivedState }> = ({ api, state }) => {
  const { networkId } = useAppContext();
  // The key predates the redesign; keeping it keeps a draft made before it.
  const activeKey = 'amana:check-draft:v2:' + api.deployedContractAddress;
  const historyKey = 'amana:check-history:' + api.deployedContractAddress;

  const [active, setActive] = useState<SavedCheck | null>(() => read(activeKey, isSaved));
  const [history, setHistory] = useState<SavedCheck[]>(() => readHistory(historyKey));
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [threshold, setThreshold] = useState('14');
  const [months, setMonths] = useState<WindowMonths>('24');
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);
  const [lookup, setLookup] = useState(false);
  const tx = useTransaction();
  const counter = useRef(0);

  const now = utils.currentPeriod();
  const t = utils.parseUint(threshold);
  const m = BigInt(months);
  const composeValid = t !== null && t > 0n && m <= now + 1n;
  const previewFrom = now - m + 1n;

  const refresh = useCallback(
    async (checkId: string) => {
      const n = ++counter.current;
      setChecking(true);
      try {
        const o = await api.readCheck(checkId);
        if (n === counter.current) setOutcome(o);
      } finally {
        if (n === counter.current) setChecking(false);
      }
    },
    [api],
  );

  // Pick up where this device left off.
  useEffect(() => {
    if (active) void refresh(active.draft.checkId).catch(setError);
    // Only on mount and when switching checks.
  }, [active?.draft.checkId]);

  const phase: 'compose' | 'collect' | 'waiting' | 'result' = !active
    ? 'compose'
    : outcome?.answered
      ? 'result'
      : outcome?.exists
        ? 'waiting'
        : 'collect';

  // While the applicant proves, look for the answer: on a timer, and
  // whenever the registry's answered count moves.
  useEffect(() => {
    if (phase !== 'waiting' || !active) return;
    const timer = setInterval(() => void refresh(active.draft.checkId).catch(() => undefined), POLL_MS);
    return () => clearInterval(timer);
  }, [phase, active, refresh]);

  const answeredCount = state.registry.checksAnswered;
  useEffect(() => {
    if (phase === 'waiting' && active) void refresh(active.draft.checkId).catch(() => undefined);
  }, [answeredCount]);

  const saveActive = (c: SavedCheck | null) => {
    setActive(c);
    remember.set(activeKey, c ? JSON.stringify(c) : null);
  };

  const create = async () => {
    const draft = await api.draftCheck();
    const c: SavedCheck = {
      draft,
      minOnTime: t!.toString(),
      minPeriod: previewFrom.toString(),
      maxPeriod: now.toString(),
      createdAt: Date.now(),
    };
    counter.current++;
    setOutcome(null);
    setRecipient('');
    tx.reset();
    saveActive(c);
    const next = [c, ...history.filter((h) => h.draft.checkId !== c.draft.checkId)].slice(0, 12);
    setHistory(next);
    remember.set(historyKey, JSON.stringify(next));
  };

  const commit = () =>
    void tx.run(async () => {
      const c = active!;
      await api.createCheck(
        c.draft,
        { minOnTime: BigInt(c.minOnTime), minPeriod: BigInt(c.minPeriod), maxPeriod: BigInt(c.maxPeriod) },
        recipient.trim(),
      );
      await refresh(c.draft.checkId);
    });

  const startOver = () => {
    counter.current++;
    saveActive(null);
    setOutcome(null);
    setRecipient('');
    setError(null);
    tx.reset();
  };

  const open = (c: SavedCheck) => {
    counter.current++;
    setOutcome(null);
    setRecipient('');
    setError(null);
    tx.reset();
    saveActive(c);
    document.getElementById('new-check')?.scrollIntoView({ block: 'start' });
  };

  const steps: StepItem[] = [
    { label: 'Draft the check', who: 'You', state: phase === 'compose' ? 'current' : 'done' },
    {
      label: 'Applicant sends a key',
      who: 'Applicant',
      state: phase === 'compose' ? 'upcoming' : phase === 'collect' && !utils.isHex32(recipient.trim()) ? 'waiting' : 'done',
    },
    {
      label: 'Commit the terms',
      who: 'You',
      state: phase === 'compose' ? 'upcoming' : phase === 'collect' ? (utils.isHex32(recipient.trim()) ? 'current' : 'upcoming') : 'done',
    },
    {
      label: 'Applicant proves',
      who: 'Applicant',
      state: phase === 'result' ? 'done' : phase === 'waiting' ? 'waiting' : 'upcoming',
    },
    { label: 'Read the result', who: 'You', state: phase === 'result' ? 'done' : 'upcoming' },
  ];

  const terms = active
    ? { minOnTime: BigInt(active.minOnTime), from: BigInt(active.minPeriod), to: BigInt(active.maxPeriod) }
    : null;

  return (
    <div className="role-screen verifier">
      <PageHeader
        eyebrow="Verifying institution"
        title="Credit checks"
        lede="Ask an applicant one question about their repayment record. You get a yes backed by a zero-knowledge proof, and nothing else."
        actions={
          <Button variant="secondary" icon={<FileSearch size={16} aria-hidden />} onClick={() => setLookup(true)}>
            Look up a check
          </Button>
        }
      />

      <Panel
        id="new-check"
        tone="raised"
        icon={<ShieldCheck size={18} />}
        title={phase === 'compose' ? 'New credit check' : phase === 'result' ? 'Check result' : 'Check in progress'}
        description={
          phase === 'compose'
            ? 'Choose the bar and the window. The applicant proves against exactly these terms, which you commit before they answer.'
            : terms
              ? `At least ${terms.minOnTime} on-time repayments, ${span(terms.from, terms.to)}.`
              : undefined
        }
        actions={
          phase !== 'compose' ? (
            <Button variant="ghost" size="sm" icon={<Plus size={15} aria-hidden />} onClick={startOver}>
              New check
            </Button>
          ) : undefined
        }
      >
        <div className="check-flow">
          <Stepper steps={steps} label="Credit check" />
          <div className="check-body">
            {error !== null && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

            {phase === 'compose' && (
              <form
                className="compose"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <div className="compose-fields">
                  <Field label="On-time repayments required" hint="Across every institution the applicant has repaid.">
                    <NumberInput value={threshold} onChange={setThreshold} min={1} max={65535} />
                  </Field>
                  <ChoiceChips legend="Look back over" options={WINDOWS} value={months} onChange={setMonths} />
                </div>
                <div className="ask">
                  <p className="ask-label">The applicant will be asked</p>
                  <p className="ask-question">
                    Have you made <b>at least {t !== null && t > 0n ? t.toString() : '…'}</b> on-time repayments
                    between <b>{month(previewFrom)}</b> and <b>{month(now)}</b>?
                  </p>
                </div>
                <div className="compose-actions">
                  <AsyncButton
                    iconEnd={<ArrowRight size={16} aria-hidden />}
                    disabled={!composeValid}
                    onRun={create}
                    onError={setError}
                  >
                    Create check ID
                  </AsyncButton>
                  <p>Free and off chain. Nothing is published until you commit the terms.</p>
                </div>
              </form>
            )}

            {phase === 'collect' && active && (
              <div className="collect">
                <ShareValue
                  label="1 · Send this check ID to the applicant"
                  value={active.draft.checkId}
                  hint="Use the channel you already use for this application."
                />
                {tx.status.phase === 'idle' || tx.status.phase === 'failed' ? (
                  <form
                    className="collect-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (utils.isHex32(recipient.trim())) commit();
                    }}
                  >
                    <Field
                      label="2 · Paste the applicant’s response key"
                      hint="It binds the check to the applicant’s wallet, so nobody else can answer it. Make sure it came from the applicant: Amana binds a wallet, not a person."
                      error={recipient.trim() && !utils.isHex32(recipient.trim()) ? 'That is not a 64-character key.' : undefined}
                    >
                      <Input
                        mono
                        value={recipient}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="The applicant’s response key"
                        onChange={(e) => setRecipient(e.target.value)}
                      />
                    </Field>
                    {tx.status.phase === 'failed' && (
                      <TxProgress
                        status={tx.status}
                        title="Committing the check"
                        expectedSeconds={EXPECTED_SECONDS.transaction}
                        onDismiss={tx.reset}
                      />
                    )}
                    <div className="compose-actions">
                      <Button type="submit" icon={<Upload size={16} aria-hidden />} disabled={!utils.isHex32(recipient.trim())}>
                        Commit the check on chain
                      </Button>
                      <p>About {EXPECTED_SECONDS.transaction} seconds. The terms cannot be changed afterwards.</p>
                    </div>
                  </form>
                ) : (
                  <TxProgress
                    status={tx.status}
                    title="Committing the check on chain"
                    expectedSeconds={EXPECTED_SECONDS.transaction}
                    successTitle="Check committed"
                    successBody="The applicant can now review the terms and prove."
                  />
                )}
              </div>
            )}

            {phase === 'waiting' && active && terms && (
              <div className="awaiting">
                {tx.status.phase === 'done' && (
                  <TxProgress
                    status={tx.status}
                    title=""
                    expectedSeconds={EXPECTED_SECONDS.transaction}
                    successTitle="Check committed on chain"
                    successBody="Tell the applicant it is ready. They review the terms and prove from their own device."
                    onDismiss={tx.reset}
                  />
                )}
                <div className="answer-waiting" role="status">
                  <Spinner size={16} />
                  <span>
                    <b>Waiting for the applicant to prove.</b> A proof takes them about {EXPECTED_SECONDS.proof}{' '}
                    seconds. This page checks every 15 seconds.
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw size={14} aria-hidden />}
                    loading={checking}
                    onClick={() => void refresh(active.draft.checkId).catch(setError)}
                  >
                    Check now
                  </Button>
                </div>
                <div className="receipt-stage">
                  <Receipt status="awaiting" threshold={terms.minOnTime} from={terms.from} to={terms.to} network={networkId} />
                </div>
              </div>
            )}

            {phase === 'result' && outcome?.terms && (
              <div className="result">
                <div className="receipt-stage">
                  <Receipt
                    status="cleared"
                    threshold={outcome.terms.minOnTime}
                    from={outcome.terms.minPeriod}
                    to={outcome.terms.maxPeriod}
                    network={networkId}
                    notTold={NOT_TOLD}
                  >
                    <TechDetails tone="paper">
                      <TechRow label="Check ID" value={outcome.checkId} />
                      {outcome.result && (
                        <TechRow label="One-time code" note="nullifier" value={utils.bytesToHex(outcome.result.nullifier)} />
                      )}
                    </TechDetails>
                  </Receipt>
                </div>
                <Alert tone="info" title="What a cleared check means">
                  Admitted institutions attested these repayments, and the applicant’s wallet proved it holds them, live,
                  inside your window. It is not an affordability assessment, and not proof of no other debt. A record
                  revoked later does not undo a result already accepted.
                </Alert>
              </div>
            )}
          </div>

          {active && (
            <TechDetails>
              <TechRow label="Check ID" value={active.draft.checkId} />
              <TechRow label="Your verifier key" value={active.draft.verifier} />
              <TechRow label="Draft nonce" note="kept on this device until committed" value={active.draft.nonce} />
              {outcome?.terms && <TechRow label="Bound response key" value={utils.bytesToHex(outcome.terms.recipient)} />}
              <TechRow label="Window" note="period indexes" value={`${active.minPeriod} – ${active.maxPeriod}`} copy={false} />
            </TechDetails>
          )}
          {phase !== 'compose' && phase !== 'result' && (
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} aria-hidden />} onClick={startOver} className="flow-back">
              Discard and start a new check
            </Button>
          )}
        </div>
      </Panel>

      <RecentChecks api={api} history={history} activeId={active?.draft.checkId ?? null} onOpen={open} answered={answeredCount} />

      <LookupDialog api={api} open={lookup} onClose={() => setLookup(false)} />
    </div>
  );
};

/** Checks this device drafted, newest first, with where each stands. */
const RecentChecks: React.FC<{
  api: AmanaClient;
  history: readonly SavedCheck[];
  activeId: string | null;
  answered: bigint;
  onOpen: (c: SavedCheck) => void;
}> = ({ api, history, activeId, answered, onOpen }) => {
  const [status, setStatus] = useState<Record<string, 'draft' | 'committed' | 'cleared' | 'unknown'>>({});

  useEffect(() => {
    let stopped = false;
    void Promise.all(
      history.map(async (h) => {
        try {
          const o = await api.readCheck(h.draft.checkId);
          return [h.draft.checkId, o.answered ? 'cleared' : o.exists ? 'committed' : 'draft'] as const;
        } catch {
          return [h.draft.checkId, 'unknown'] as const;
        }
      }),
    ).then((entries) => {
      if (!stopped) setStatus(Object.fromEntries(entries));
    });
    return () => {
      stopped = true;
    };
  }, [api, history, answered]);

  return (
    <section aria-labelledby="recent-title">
      <header className="section-head">
        <h2 id="recent-title">Recent checks</h2>
        <span className="section-count">from this device</span>
      </header>
      {history.length === 0 ? (
        <EmptyState icon={<History size={24} />} title="No checks yet">
          Checks you create appear here, with where each one stands.
        </EmptyState>
      ) : (
        <ul className="check-list">
          {history.map((h) => {
            const s = status[h.draft.checkId];
            return (
              <li key={h.draft.checkId} className={h.draft.checkId === activeId ? 'is-active' : ''}>
                <div className="check-list-main">
                  <span className="check-list-terms">
                    At least <b className="num">{h.minOnTime}</b> on time
                  </span>
                  <span className="check-list-window num">{span(BigInt(h.minPeriod), BigInt(h.maxPeriod))}</span>
                </div>
                <code className="check-list-id">{shortHex(h.draft.checkId, 6, 4)}</code>
                {s === 'cleared' ? (
                  <StatusPill tone="live">Cleared</StatusPill>
                ) : s === 'committed' ? (
                  <StatusPill tone="pending">Awaiting proof</StatusPill>
                ) : s === 'draft' ? (
                  <StatusPill tone="neutral">Not committed</StatusPill>
                ) : (
                  <StatusPill tone="neutral">…</StatusPill>
                )}
                <Button variant="ghost" size="sm" onClick={() => onOpen(h)} disabled={h.draft.checkId === activeId}>
                  {h.draft.checkId === activeId ? 'Showing' : 'View'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
