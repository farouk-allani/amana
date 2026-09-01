// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import type { AmanaAPI, AmanaDerivedState, CheckOutcome } from '../../../api/src/index.js';
import { utils } from '../../../api/src/index.js';
import { ActionButton, Badge, Card, Field, Hash, Notice } from '../ui.jsx';

export const VerifierView: React.FC<{ api: AmanaAPI; state: AmanaDerivedState }> = ({ api }) => {
  const [checkId, setCheckId] = useState('');
  const [minOnTime, setMinOnTime] = useState('14');
  const [windowMonths, setWindowMonths] = useState('24');
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [error, setError] = useState('');

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}

      <Card
        title="Ask for a credit standing"
        lede="Set your terms, generate a check identifier, and give it to the applicant however you already talk to them. Whoever answers it is whoever you handed it to — the identifier is the introduction, and Amana never needs to learn their name."
      >
        <div className="field-row">
          <Field label="On-time repayments required">
            <input
              value={minOnTime}
              inputMode="numeric"
              onChange={(e) => setMinOnTime(e.target.value)}
            />
          </Field>
          <Field label="Within the last (months)">
            <input
              value={windowMonths}
              inputMode="numeric"
              onChange={(e) => setWindowMonths(e.target.value)}
            />
          </Field>
        </div>

        <div className="actions">
          <button
            className="btn primary"
            onClick={() => {
              setCheckId(utils.newCheckId());
              setOutcome(null);
            }}
          >
            Generate a check
          </button>
        </div>

        {checkId && (
          <>
            <div className="kv" style={{ marginTop: 18 }}>
              <span className="k">Check identifier</span>
              <span className="v">
                <Hash value={checkId} />
              </span>
            </div>
            <div className="hint">
              Click to copy. Send this to the applicant along with your terms: {minOnTime} on-time
              repayments within {windowMonths} months.
            </div>
          </>
        )}
      </Card>

      <Card
        title="Read the answer"
        lede="A check is answered at most once. If it comes back cleared, a holder of valid, unrevoked attestations proved they met your bar — and the chain recorded your threshold, not their total."
      >
        <Field label="Check identifier">
          <input
            className="mono"
            value={checkId}
            placeholder="9b04…"
            onChange={(e) => setCheckId(e.target.value)}
          />
        </Field>

        <ActionButton
          label="Check for an answer"
          busyLabel="Reading the ledger…"
          kind="ghost"
          disabled={checkId.trim().length !== 64}
          onRun={async () => setOutcome(await api.readCheck(checkId.trim()))}
          onError={setError}
        />

        {outcome && (
          <div style={{ marginTop: 20 }}>
            {outcome.answered && outcome.result ? (
              <>
                <Notice kind="ok">
                  <strong>Cleared.</strong> The applicant proved at least{' '}
                  {outcome.result.minOnTime.toString()} on-time repayments, none older than{' '}
                  {utils.formatPeriod(outcome.result.minPeriod)}, across attestations that were
                  live at the moment of proving.
                </Notice>
                <div className="kv">
                  <span className="k">Threshold cleared</span>
                  <span className="v">{outcome.result.minOnTime.toString()} on-time</span>
                </div>
                <div className="kv">
                  <span className="k">Recency floor</span>
                  <span className="v">{utils.formatPeriod(outcome.result.minPeriod)}</span>
                </div>
                <div className="kv">
                  <span className="k">Nullifier</span>
                  <span className="v">
                    <Hash value={toHexString(outcome.result.nullifier)} />
                  </span>
                </div>
                <div className="hint" style={{ marginTop: 14 }}>
                  That nullifier is specific to this check. The same person answering a different
                  lender's check burns an unrelated one, so no two verifiers can compare notes and
                  discover they are looking at the same applicant.
                </div>
              </>
            ) : (
              <Notice kind="info">
                Not answered yet. <Badge kind="neutral">awaiting the applicant</Badge>
              </Notice>
            )}
          </div>
        )}
      </Card>

      <Card title="What you did not learn">
        <div className="split">
          <section className="public">
            <h3>You now know</h3>
            <ul>
              <li>The applicant cleared {minOnTime} on-time repayments</li>
              <li>Those repayments are recent enough for your terms</li>
              <li>The underlying attestations were live, not revoked</li>
              <li>They have not answered this same check before</li>
            </ul>
          </section>
          <section className="private">
            <h3>You still do not know</h3>
            <ul>
              <li>Their actual repayment total</li>
              <li>Which institutions lent to them</li>
              <li>How many credentials they hold</li>
              <li>How much they borrowed, or on what terms</li>
              <li>Whether they are anyone you have assessed before</li>
            </ul>
          </section>
        </div>
      </Card>
    </>
  );
};

const toHexString = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
