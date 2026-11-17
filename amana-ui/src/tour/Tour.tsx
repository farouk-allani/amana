// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Amana without a wallet: one borrower, two lenders she repaid, a third that
 * has never seen her, and the contract deciding what the third may learn.
 *
 * The page runs the compiled circuits in the browser through
 * `local/engine.ts`. It says plainly what that is and is not: every rule the
 * contract enforces is enforced here, no zero-knowledge proof is built, and
 * nothing is sent to a network. The run on a real network is linked at the
 * end.
 */

import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpenCheck,
  CircleHelp,
  ExternalLink,
  Landmark,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import {
  Alert,
  Button,
  CredentialCard,
  Field,
  NumberInput,
  Panel,
  PrivacySplit,
  Receipt,
  Spinner,
  StatusPill,
  shortHex,
} from '../components/index.js';
import { count, span } from '../format.js';
import { Lockup } from '../shell/Shell.jsx';
import * as utils from '../../../api/src/utils/index.js';
import {
  CHEATS,
  NAMES,
  WHO,
  answerQuestion,
  askQuestion,
  openStory,
  tryCheat,
  type Cheat,
  type Outcome,
  type Story,
} from '../local/story.js';
import './tour.css';

/** The credit check the scripted run answered on Midnight Preprod. */
const PREPROD_PROOF =
  'https://preprod.midnightexplorer.com/transactions/f493653f6189afc6f3b91652fc6fbc97b93d882ce635f27bef89ca0535de8c6e';
const REPO = 'https://github.com/farouk-allani/amana';

const ms = (n: number): string => (n < 1 ? 'under 1 ms' : `${Math.round(n)} ms`);

/** Let the browser paint a busy state before a circuit holds the thread. */
const nextPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const StepHead: React.FC<{ n: number; who: string; done?: boolean }> = ({ n, who, done }) => (
  <span className={`tour-step-mark${done ? ' is-done' : ''}`}>
    <span className="tour-step-n num">{n}</span>
    <span className="tour-step-who">{who}</span>
  </span>
);

export const Tour: React.FC<{ networkId: string; onExit: () => void }> = ({ networkId, onExit }) => {
  const [story, setStory] = useState<Story | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const [setupMs, setSetupMs] = useState(0);
  // The registry is a mutable object; this counts the changes to it.
  const [version, bump] = useReducer((n: number) => n + 1, 0);

  const [threshold, setThreshold] = useState('14');
  const [checkId, setCheckId] = useState<string | null>(null);
  const [asked, setAsked] = useState<bigint | null>(null);
  const [answer, setAnswer] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<'ask' | 'answer' | 'cheat' | null>(null);
  const [cheats, setCheats] = useState<Readonly<Record<string, Outcome>>>({});
  const answerRef = useRef<HTMLDivElement>(null);

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void nextPaint().then(() => {
      try {
        const started = performance.now();
        setStory(openStory());
        setSetupMs(performance.now() - started);
      } catch (e) {
        setFailed(e);
      }
    });
  }, []);

  const wallet = useMemo(() => (story ? story.registry.wallet(WHO.borrower) : []), [story, version]);
  const pub = useMemo(() => (story ? story.registry.publicLedger() : null), [story, version]);

  const bar = utils.parseUint(threshold, 16);
  const barError =
    bar === null || bar === 0n ? 'Enter a whole number of repayments, 1 or more.' : undefined;

  const ask = async () => {
    if (!story || bar === null || bar === 0n) return;
    setBusy('ask');
    await nextPaint();
    try {
      setCheckId(askQuestion(story, bar));
      setAsked(bar);
      setAnswer(null);
      bump();
    } catch (e) {
      setFailed(e);
    } finally {
      setBusy(null);
    }
  };

  const respond = async () => {
    if (!story || !checkId) return;
    setBusy('answer');
    await nextPaint();
    try {
      setAnswer(answerQuestion(story, checkId));
      bump();
      requestAnimationFrame(() => answerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    } catch (e) {
      setFailed(e);
    } finally {
      setBusy(null);
    }
  };

  const askAgain = () => {
    setCheckId(null);
    setAsked(null);
    setAnswer(null);
  };

  const cheat = async (which: readonly Cheat[]) => {
    if (!story) return;
    setBusy('cheat');
    await nextPaint();
    try {
      const results: Record<string, Outcome> = {};
      for (const c of which) results[c.id] = tryCheat(story, c);
      setCheats((prev) => ({ ...prev, ...results }));
    } catch (e) {
      setFailed(e);
    } finally {
      setBusy(null);
    }
  };

  const refused = CHEATS.filter((c) => cheats[c.id] && !cheats[c.id].accepted).length;
  const tried = CHEATS.filter((c) => cheats[c.id]).length;
  const lenderName = (key: string): string =>
    story && key === utils.bytesToHex(story.registry.lenderKey(WHO.lenderA))
      ? NAMES.lenderA
      : story && key === utils.bytesToHex(story.registry.lenderKey(WHO.lenderB))
        ? NAMES.lenderB
        : 'A lender';

  const cleared = answer?.accepted === true;
  const used =
    story && asked !== null && asked <= story.recordA.attestation.onTime
      ? [NAMES.lenderA]
      : [NAMES.lenderA, NAMES.lenderB];

  return (
    <div className="tour">
      <a className="skip-link" href="#tour-main">
        Skip to content
      </a>
      <div className="connect-glow" aria-hidden />

      <header className="tour-top">
        <Lockup height={30} />
        <StatusPill tone="gold">
          <span className="hide-sm">Running in your browser, </span>no wallet
        </StatusPill>
        <span className="tour-top-space" />
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} aria-hidden />} onClick={onExit}>
          Back<span className="hide-sm"> to start</span>
        </Button>
      </header>

      <main id="tour-main" className="tour-main" tabIndex={-1}>
        <section className="tour-intro" aria-labelledby="tour-title">
          <p className="page-eyebrow">Try it in one minute</p>
          <h1 id="tour-title" className="tour-title">
            A borrower takes her repayment record to a lender that has never seen her.
          </h1>
          <p className="tour-lede">
            This page runs Amana’s contract in your browser: the same compiled circuits that are live on Midnight
            Preprod.
          </p>
          <ul className="tour-honest">
            <li>
              <b>Real here:</b> every rule the contract enforces. Each button below runs a circuit, and a refusal is
              the contract’s own.
            </li>
            <li>
              <b>Not here:</b> no zero-knowledge proof is built and nothing is sent to a network. The people are
              fictional. <a href="#tour-chain">The run on a real network</a> is at the end.
            </li>
          </ul>
        </section>

        {failed !== null && (
          <Alert tone="error" title="The contract could not be run in this browser">
            {failed instanceof Error ? failed.message : String(failed)}
          </Alert>
        )}

        {!story && failed === null && (
          <div className="loading-screen" role="status">
            <Spinner size={22} />
            <p>Deploying a registry in this page and filing two records…</p>
          </div>
        )}

        {story && pub && (
          <div className="tour-grid">
            <div className="tour-steps">
              {/* 1 ---------------------------------------------------------- */}
              <Panel
                title={`${NAMES.borrower} has repaid two lenders`}
                description={
                  <>
                    {NAMES.borrower} runs a small sewing workshop. Over two years she repaid {NAMES.lenderA} eight
                    times, all on time, and {NAMES.lenderB} seven times, six of them on time. Each lender filed one
                    fingerprint of its record and gave {NAMES.borrower} the record itself. She keeps them; nobody
                    else has both.
                  </>
                }
                icon={<UserRound size={18} />}
                actions={<StepHead n={1} who={NAMES.borrower} done />}
              >
                <div className="tour-cards">
                  {wallet.map((r) => (
                    <CredentialCard
                      key={r.leafIndex.toString()}
                      institution={r.lenderName}
                      onTime={r.attestation.onTime}
                      total={r.attestation.total}
                      from={r.attestation.periodStart}
                      to={r.attestation.periodEnd}
                      live={r.live}
                      size="mini"
                      held={false}
                    />
                  ))}
                </div>
                <p className="tour-note">
                  Five circuits ran to set this up (activate the registry, admit two lenders, file two records), in{' '}
                  {ms(setupMs)}.
                </p>
              </Panel>

              {/* 2 ---------------------------------------------------------- */}
              <Panel
                title={`${NAMES.newLender} asks one question`}
                description={
                  <>
                    {NAMES.newLender} has never lent to {NAMES.borrower}. It cannot ask the other two: a lender’s
                    reliable payers are its business, and a list of them is a list of customers to poach. So it asks{' '}
                    {NAMES.borrower}, and commits the question so it cannot be changed afterwards.
                  </>
                }
                icon={<Landmark size={18} />}
                actions={<StepHead n={2} who={NAMES.newLender} done={checkId !== null} />}
              >
                {checkId === null ? (
                  <div className="tour-ask">
                    <Field
                      label="On-time repayments required, in the last 24 months"
                      error={barError}
                      hint={`${NAMES.borrower} holds 14. Ask for more to see the contract decline.`}
                    >
                      <NumberInput value={threshold} onChange={setThreshold} min={1} max={60} unit="on time" />
                    </Field>
                    <Button
                      size="lg"
                      iconEnd={<ArrowRight size={18} aria-hidden />}
                      loading={busy === 'ask'}
                      disabled={barError !== undefined || busy !== null}
                      onClick={() => void ask()}
                    >
                      Commit the question
                    </Button>
                  </div>
                ) : (
                  <p className="tour-committed">
                    <CircleHelp size={18} aria-hidden />
                    <span>
                      Committed: has {NAMES.borrower} made <b className="num">at least {asked?.toString()}</b> on-time
                      repayments between <b className="num">{span(story.window.minPeriod, story.window.maxPeriod)}</b>?
                    </span>
                  </p>
                )}
              </Panel>

              {/* 3 ---------------------------------------------------------- */}
              <Panel
                tone={checkId !== null && answer === null ? 'raised' : 'default'}
                title={`${NAMES.borrower} answers without showing her records`}
                description={
                  checkId === null
                    ? `Waiting for ${NAMES.newLender}’s question.`
                    : `Before anything is sent, ${NAMES.borrower} sees exactly what ${NAMES.newLender} will learn.`
                }
                icon={<ShieldCheck size={18} />}
                actions={<StepHead n={3} who={NAMES.borrower} done={cleared} />}
                className={checkId === null ? 'is-waiting' : undefined}
              >
                {checkId !== null && asked !== null && (
                  <div className="tour-answer" ref={answerRef}>
                    {answer === null && (
                      <>
                        <PrivacySplit
                          seesTitle={`What ${NAMES.newLender} learns`}
                          keepsTitle={`What stays with ${NAMES.borrower}`}
                          sees={[
                            { label: 'Whether the bar was cleared', value: `At least ${asked.toString()}` },
                            { label: 'The months it asked about', value: span(story.window.minPeriod, story.window.maxPeriod) },
                          ]}
                          keeps={[
                            { label: 'Which lenders she repaid', value: `${NAMES.lenderA}, ${NAMES.lenderB}` },
                            { label: 'Her real total', value: `${story.held.toString()} on time` },
                            { label: 'How many records she holds', value: count(wallet.length, 'record') },
                            { label: 'Who she is', value: 'No name, no reusable key' },
                          ]}
                        />
                        <Button
                          size="lg"
                          iconEnd={<ArrowRight size={18} aria-hidden />}
                          loading={busy === 'answer'}
                          disabled={busy !== null}
                          onClick={() => void respond()}
                        >
                          Answer the question
                        </Button>
                      </>
                    )}

                    {answer?.accepted === true && (
                      <>
                        <Receipt
                          status="cleared"
                          threshold={asked}
                          from={story.window.minPeriod}
                          to={story.window.maxPeriod}
                          network={networkId}
                          evidence="Contract circuit accepted the answer"
                          venue="This browser, not a network"
                          notTold={[
                            'Which lenders issued the records',
                            `Her real total, or how far above ${asked.toString()} it is`,
                            'How many records she used',
                            'Anything that links this answer to her next one',
                          ]}
                        />
                        <p className="tour-note">
                          This is all {NAMES.newLender} receives. The circuit used{' '}
                          {used.length === 1 ? 'one record' : 'both records'} and ran in {ms(answer.ms)}. On a network,
                          the same run becomes a zero-knowledge proof that takes about 100 seconds to build.{' '}
                          <button type="button" className="link-button" onClick={askAgain}>
                            Ask a different question
                          </button>
                        </p>
                      </>
                    )}

                    {answer?.accepted === false && (
                      <Alert
                        tone="warning"
                        title="Not cleared, and nothing recorded"
                        action={
                          <Button variant="secondary" size="sm" onClick={askAgain}>
                            Ask a different question
                          </Button>
                        }
                      >
                        <p>
                          The contract declined: <code className="tour-reason">{answer.reason}</code>. {NAMES.newLender}{' '}
                          learns that no answer arrived. It does not learn that {NAMES.borrower} holds{' '}
                          {story.held.toString()}, or anything else.
                        </p>
                      </Alert>
                    )}
                  </div>
                )}
              </Panel>

              {/* 4 ---------------------------------------------------------- */}
              <Panel
                title="Now try to cheat"
                description={
                  <>
                    Each attempt below runs the circuit for real with dishonest data, on a copy of the registry so
                    your run above is untouched. The message shown is the contract’s own.
                  </>
                }
                icon={<ShieldAlert size={18} />}
                actions={<StepHead n={4} who="You" done={tried === CHEATS.length} />}
              >
                <div className="tour-cheat-bar">
                  <Button
                    variant="secondary"
                    loading={busy === 'cheat'}
                    disabled={busy !== null}
                    onClick={() => void cheat(CHEATS)}
                  >
                    Try all {CHEATS.length}
                  </Button>
                  <span className="tour-cheat-score" role="status">
                    {tried === 0 ? 'None tried yet.' : `${refused} of ${tried} refused by the contract.`}
                  </span>
                </div>
                <ul className="tour-cheats">
                  {CHEATS.map((c) => {
                    const outcome = cheats[c.id];
                    return (
                      <li key={c.id} className={`tour-cheat${outcome ? (outcome.accepted ? ' is-accepted' : ' is-refused') : ''}`}>
                        <h3 className="tour-cheat-title">{c.title}</h3>
                        <p className="tour-cheat-attempt">{c.attempt}</p>
                        {outcome === undefined && (
                          <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void cheat([c])}>
                            Try it
                          </Button>
                        )}
                        {outcome && !outcome.accepted && (
                          <div className="tour-verdict">
                            <span className="tour-verdict-head">
                              <Ban size={15} aria-hidden /> Refused
                            </span>
                            <code className="tour-reason">{outcome.reason}</code>
                            <span className="tour-verdict-why">{c.why}</span>
                          </div>
                        )}
                        {outcome?.accepted && (
                          <div className="tour-verdict">
                            <span className="tour-verdict-head">Accepted</span>
                            <span className="tour-verdict-why">
                              The contract accepted this. That is a defect: please report it.
                            </span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Panel>

              {/* 5 ---------------------------------------------------------- */}
              <Panel
                id="tour-chain"
                title="The same run on a real network"
                description="What you just did in memory, a scripted run did on Midnight Preprod with real zero-knowledge proofs: 14 transactions, and 7 attempts the contract refused."
                icon={<BookOpenCheck size={18} />}
                actions={<StepHead n={5} who="Anyone" />}
              >
                <ul className="tour-links">
                  <li>
                    <a href={PREPROD_PROOF} target="_blank" rel="noreferrer">
                      A credit check answered on Preprod <ExternalLink size={14} aria-hidden />
                    </a>
                    <span>The proof transaction, on the public explorer.</span>
                  </li>
                  <li>
                    <a href={`${REPO}/blob/main/docs/evidence/preprod-run.md`} target="_blank" rel="noreferrer">
                      Every step of the Preprod run <ExternalLink size={14} aria-hidden />
                    </a>
                    <span>Who did what, which circuit, and each refusal with its reason.</span>
                  </li>
                  <li>
                    <a href={REPO} target="_blank" rel="noreferrer">
                      Source, tests and self-audit <ExternalLink size={14} aria-hidden />
                    </a>
                    <span>
                      <code>npm run verify:onchain</code> re-checks the live registry with no wallet.
                    </span>
                  </li>
                </ul>
                <div className="tour-next">
                  <Button variant="secondary" iconEnd={<ArrowRight size={16} aria-hidden />} onClick={onExit}>
                    Use Amana with a wallet
                  </Button>
                  <span>Needs the Lace Midnight wallet and a proof server on your computer.</span>
                </div>
              </Panel>
            </div>

            {/* the ledger ---------------------------------------------------- */}
            <aside className="tour-ledger" aria-labelledby="tour-ledger-title">
              <div className="tour-ledger-card">
                <h2 id="tour-ledger-title" className="tour-ledger-title">
                  <ScrollText size={17} aria-hidden /> The public ledger
                </h2>
                <p className="tour-ledger-lede">Everything anyone watching the chain can read. It changes as you go.</p>

                <dl className="tour-ledger-rows">
                  <div>
                    <dt>Lenders admitted</dt>
                    <dd>{pub.lenders.map(lenderName).sort().join(', ')}</dd>
                  </div>
                  {pub.records.map((r) => {
                    const mine = wallet.find((w) => w.leafIndex === r.leaf);
                    return (
                      <div key={`r${r.leaf}`} className="is-new">
                        <dt>Record fingerprint</dt>
                        <dd>
                          <code>{mine ? shortHex(story.registry.fingerprint(mine)) : '…'}</code>
                          <span>filed by {lenderName(r.filedBy)}</span>
                        </dd>
                      </div>
                    );
                  })}
                  {pub.checks.map((c) => (
                    <React.Fragment key={c.checkId}>
                      <div className="is-new">
                        <dt>Question</dt>
                        <dd>
                          <span className="num">
                            At least {c.terms.minOnTime.toString()}, {span(c.terms.minPeriod, c.terms.maxPeriod)}
                          </span>
                          <span>
                            id <code>{shortHex(c.checkId, 6, 4)}</code>
                          </span>
                        </dd>
                      </div>
                      {c.result && (
                        <div className="is-new is-cleared">
                          <dt>Answer</dt>
                          <dd>
                            <span>Cleared</span>
                            <span>
                              one-time marker <code>{shortHex(utils.bytesToHex(c.result.nullifier), 6, 4)}</code>
                            </span>
                          </dd>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </dl>

                <div className="tour-ledger-not">
                  <p className="tour-ledger-not-title">Never on the ledger</p>
                  <ul>
                    <li>{NAMES.borrower}’s name, or any key that identifies her</li>
                    <li>The counts 8 and 6, or their total</li>
                    <li>Which records answered a question, or how many</li>
                    <li>That the two fingerprints belong to one person</li>
                  </ul>
                </div>

                <p className="tour-ledger-foot">
                  {count(story.registry.calls, 'circuit call')} so far, all in this page.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>

      <footer className="connect-foot tour-foot">
        <span>Nothing on this page leaves your browser. The registry here is discarded when you close it.</span>
        <a href={REPO} target="_blank" rel="noreferrer">
          Source and documentation
        </a>
      </footer>
    </div>
  );
};

export default Tour;
