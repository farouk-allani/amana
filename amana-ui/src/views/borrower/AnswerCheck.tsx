// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Answering a lender's credit check, one step at a time.
 *
 * The borrower receives a check ID, returns a response key that binds the
 * check to them, waits for the lender to commit the terms on chain, then
 * reviews exactly what a proof would reveal before consenting to it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, RefreshCw, ShieldCheck } from 'lucide-react';

import type { AmanaDerivedState, CheckOutcome } from '../../../../api/src/index.js';
import { utils } from '../../../../api/src/index.js';
import { provableTotal, selectAttestations } from '../../../../contract/src/witnesses.js';
import { EXPECTED_SECONDS, useAppContext, type AmanaClient } from '../../client.js';
import {
  Alert,
  AsyncButton,
  Button,
  CredentialCard,
  ErrorAlert,
  Field,
  Input,
  PrivacySplit,
  Receipt,
  ShareValue,
  Spinner,
  Stepper,
  TechDetails,
  TechRow,
  TxProgress,
  type StepItem,
} from '../../components/index.js';
import { count, list, month, remember, span } from '../../format.js';
import { useTransaction } from '../../transactions.js';

type Phase = 'enter' | 'send' | 'review' | 'answered';

const POLL_MS = 15_000;

export const AnswerCheck: React.FC<{ api: AmanaClient; state: AmanaDerivedState }> = ({ api, state }) => {
  const { networkId } = useAppContext();
  const memory = `amana:borrower-check:${api.deployedContractAddress}`;
  const [input, setInput] = useState(() => remember.get(memory) ?? '');
  const [checkId, setCheckId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);
  const tx = useTransaction();
  const lookup = useRef(0);

  const phase: Phase = !checkId
    ? 'enter'
    : outcome?.answered
      ? 'answered'
      : outcome?.exists
        ? 'review'
        : 'send';

  /** Read the check's committed terms; stale answers are discarded. */
  const refresh = useCallback(
    async (id: string) => {
      const n = ++lookup.current;
      setChecking(true);
      try {
        const o = await api.readCheck(id);
        if (n === lookup.current) setOutcome(o);
      } finally {
        if (n === lookup.current) setChecking(false);
      }
    },
    [api],
  );

  const open = async (raw: string) => {
    const id = raw.trim().toLowerCase().replace(/^0x/, '');
    setError(null);
    const [key] = await Promise.all([api.checkRecipientFor(id), refresh(id)]);
    setRecipient(key);
    setCheckId(id);
    remember.set(memory, id);
  };

  const reset = () => {
    lookup.current++;
    setCheckId(null);
    setRecipient('');
    setOutcome(null);
    setInput('');
    setError(null);
    tx.reset();
    remember.set(memory, null);
  };

  // While waiting for the lender, look for the committed terms periodically.
  useEffect(() => {
    if (phase !== 'send' || !checkId) return;
    const t = setInterval(() => void refresh(checkId).catch(() => undefined), POLL_MS);
    return () => clearInterval(t);
  }, [phase, checkId, refresh]);

  const live = useMemo(() => state.wallet.attestations.filter((a) => a.live), [state.wallet.attestations]);
  const terms = outcome?.terms;
  const addressedToMe = !!terms && utils.bytesToHex(terms.recipient) === recipient;
  const provable = terms ? provableTotal(live, terms.minPeriod, terms.maxPeriod) : 0n;
  const eligible = !!terms && provable >= terms.minOnTime;
  const used = useMemo(() => {
    if (!terms) return [];
    const leaves = selectAttestations(live, terms.minOnTime, terms.minPeriod, terms.maxPeriod);
    return live.filter((a) => leaves.includes(a.leafIndex));
  }, [live, terms]);
  const usedNames = [...new Set(used.map((u) => u.lenderName))];

  const steps: StepItem[] = [
    { label: 'Lender drafts a check', who: 'Lender', state: checkId ? 'done' : 'waiting' },
    {
      label: 'Send your response key',
      who: 'You',
      state: phase === 'enter' ? 'upcoming' : phase === 'send' ? 'current' : 'done',
    },
    {
      label: 'Lender commits the terms',
      who: 'Lender',
      state: phase === 'review' || phase === 'answered' ? 'done' : phase === 'send' ? 'waiting' : 'upcoming',
    },
    {
      label: 'Review and prove',
      who: 'You',
      state: phase === 'answered' ? 'done' : phase === 'review' ? 'current' : 'upcoming',
    },
    { label: 'Lender reads the result', who: 'Lender', state: phase === 'answered' ? 'done' : 'upcoming' },
  ];

  return (
    <div className="answer">
      <Stepper steps={steps} label="Answering a credit check" />

      <div className="answer-body">
        {error !== null && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

        {phase === 'enter' && (
          <form
            className="answer-enter"
            onSubmit={(e) => {
              e.preventDefault();
              if (utils.isHex32(input.trim())) void open(input).catch(setError);
            }}
          >
            <div className="answer-copy">
              <h3>Got a check ID from a lender?</h3>
              <p>
                A lender who wants to know your repayment record sends you a check ID. Paste it here to start. You will
                see exactly what they would learn before anything is proved.
              </p>
            </div>
            <Field
              label="Check ID"
              hint="64 hexadecimal characters, from the lender."
              error={input.trim() && !utils.isHex32(input.trim()) ? 'That is not a 64-character check ID.' : undefined}
            >
              <Input
                mono
                value={input}
                spellCheck={false}
                autoComplete="off"
                placeholder="Paste the check ID"
                onChange={(e) => setInput(e.target.value)}
              />
            </Field>
            <div className="answer-actions">
              <AsyncButton
                iconEnd={<ArrowRight size={16} aria-hidden />}
                disabled={!utils.isHex32(input.trim())}
                onRun={() => open(input)}
                onError={setError}
              >
                Continue
              </AsyncButton>
            </div>
          </form>
        )}

        {phase === 'send' && checkId && (
          <div className="answer-send">
            <div className="answer-copy">
              <h3>Send this response key to the lender</h3>
              <p>
                It binds the check to you, so nobody else can answer it, and it is different for every check. Send it
                through the channel you already use for this application.
              </p>
            </div>
            <ShareValue label="Your response key for this check" value={recipient} />
            <div className="answer-waiting" role="status">
              <Spinner size={16} />
              <span>
                <b>Waiting for the lender to commit the terms.</b> This page checks again every 15 seconds.
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={14} aria-hidden />}
                loading={checking}
                onClick={() => void refresh(checkId).catch(setError)}
              >
                Check now
              </Button>
            </div>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} aria-hidden />} onClick={reset}>
              Use a different check ID
            </Button>
          </div>
        )}

        {phase === 'review' && terms && (
          <div className="answer-review">
            <div className="ask">
              <p className="ask-label">The lender asks</p>
              <p className="ask-question">
                Have you made <b>at least {terms.minOnTime.toString()}</b> on-time repayments between{' '}
                <b>{month(terms.minPeriod)}</b> and <b>{month(terms.maxPeriod)}</b>?
              </p>
            </div>

            {!addressedToMe ? (
              <Alert tone="error" title="This check was set up for someone else">
                The lender committed it with a different response key, so only that person can answer it. Ask the
                lender to set it up again with your key.
              </Alert>
            ) : (
              <>
                <div className={`eligibility ${eligible ? 'is-yes' : 'is-no'}`}>
                  {eligible ? <CircleCheck size={20} aria-hidden /> : <CircleX size={20} aria-hidden />}
                  <p>
                    {eligible ? (
                      <>
                        <b>You can answer yes.</b> Your live records cover {provable.toString()} on-time repayments in
                        this window.
                      </>
                    ) : (
                      <>
                        <b>Not enough yet.</b> Your live records cover {provable.toString()} on-time repayments in this
                        window; the lender asks for {terms.minOnTime.toString()}. Only records that fall wholly inside
                        the window count, and one per institution.
                      </>
                    )}
                  </p>
                </div>

                {eligible && (
                  <section className="answer-section" aria-labelledby="used-title">
                    <h4 id="used-title">
                      Records this proof will use <span>· only you see this list</span>
                    </h4>
                    <div className="used-grid">
                      {used.map((u) => (
                        <CredentialCard
                          key={u.leafIndex.toString()}
                          size="mini"
                          selected
                          institution={u.lenderName}
                          onTime={u.attestation.onTime}
                          total={u.attestation.total}
                          from={u.attestation.periodStart}
                          to={u.attestation.periodEnd}
                          live
                        />
                      ))}
                    </div>
                  </section>
                )}

                <PrivacySplit
                  seesTitle="What the lender learns"
                  sees={[
                    { label: `You cleared the bar: at least ${terms.minOnTime.toString()} on time` },
                    { label: `The window: ${span(terms.minPeriod, terms.maxPeriod)}` },
                    { label: 'A one-time code, so this answer cannot be reused' },
                  ]}
                  keeps={[
                    { label: 'Your exact total in this window', value: eligible ? provable.toString() : '—' },
                    { label: 'Which institutions', value: eligible ? list(usedNames) : '—' },
                    { label: 'How many records', value: eligible ? used.length.toString() : '—' },
                    { label: 'Your identity key and identifiers' },
                  ]}
                  keepsNote="Your own proof server reads these to build the proof. They never reach the chain or the lender."
                />

                {tx.status.phase === 'idle' ? (
                  <div className="consent">
                    <p>
                      Proving publishes the result on Midnight {networkId} and takes about {EXPECTED_SECONDS.proof}{' '}
                      seconds. Your records go only to your own proof server.
                    </p>
                    <div className="consent-actions">
                      <Button variant="ghost" onClick={reset}>
                        Not now
                      </Button>
                      <Button
                        size="lg"
                        icon={<ShieldCheck size={18} aria-hidden />}
                        disabled={!eligible}
                        onClick={() =>
                          void tx.run(async () => {
                            await api.proveCreditStanding(checkId!);
                            await refresh(checkId!);
                          })
                        }
                      >
                        Prove privately
                      </Button>
                    </div>
                  </div>
                ) : (
                  <TxProgress
                    status={tx.status}
                    title="Proving your repayment record"
                    expectedSeconds={EXPECTED_SECONDS.proof}
                    stages={{
                      prepare: { detail: 'Choosing the records to use and checking them on this device.' },
                      prove: {
                        detail: 'Your proof server is building the proof from your records. This is the long step.',
                      },
                    }}
                    onRetry={() =>
                      void tx.run(async () => {
                        await api.proveCreditStanding(checkId!);
                        await refresh(checkId!);
                      })
                    }
                    onDismiss={tx.reset}
                  />
                )}
              </>
            )}
          </div>
        )}

        {phase === 'answered' && terms && (
          <div className="answer-done">
            {tx.status.phase === 'done' ? (
              <TxProgress
                status={tx.status}
                title=""
                expectedSeconds={EXPECTED_SECONDS.proof}
                successTitle="Proof accepted on chain"
                successBody="The lender can now read the result. This is everything it shows them."
              />
            ) : (
              <Alert tone="success" title="This check has been answered">
                The lender can read the result. This is everything it shows them.
              </Alert>
            )}
            <div className="answer-receipt">
              <Receipt
                status="cleared"
                threshold={terms.minOnTime}
                from={terms.minPeriod}
                to={terms.maxPeriod}
                network={networkId}
                notTold={['Your exact number of repayments', 'Which institutions you repaid', 'How many records you used']}
              >
                <TechDetails tone="paper">
                  <TechRow label="Check ID" value={outcome!.checkId} />
                  {outcome!.result && (
                    <TechRow
                      label="One-time code"
                      note="nullifier"
                      value={utils.bytesToHex(outcome!.result.nullifier)}
                    />
                  )}
                </TechDetails>
              </Receipt>
            </div>
            <Button variant="secondary" onClick={reset}>
              Answer another check
            </Button>
          </div>
        )}
      </div>

      {phase !== 'enter' && checkId && (
        <TechDetails>
          <TechRow label="Check ID" value={checkId} />
          {recipient && <TechRow label="Response key" value={recipient} />}
          {terms && <TechRow label="Lender’s verifier key" value={utils.bytesToHex(terms.verifier)} />}
          {terms && <TechRow label="Window" note="period indexes" value={`${terms.minPeriod} – ${terms.maxPeriod}`} copy={false} />}
          <TechRow label="Records live in your passport" value={count(live.length, 'record')} copy={false} />
        </TechDetails>
      )}
    </div>
  );
};
