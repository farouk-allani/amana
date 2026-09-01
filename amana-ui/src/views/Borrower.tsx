// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import type { AmanaAPI, AmanaDerivedState } from '../../../api/src/index.js';
import { utils } from '../../../api/src/index.js';
import { ActionButton, Badge, Card, Field, Hash, Notice, Stat } from '../ui.jsx';

export const BorrowerView: React.FC<{ api: AmanaAPI; state: AmanaDerivedState }> = ({
  api,
  state,
}) => {
  const { wallet, registry } = state;

  const [lenderKey, setLenderKey] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [credential, setCredential] = useState('');

  const [checkId, setCheckId] = useState('');
  const [minOnTime, setMinOnTime] = useState('14');
  const [windowMonths, setWindowMonths] = useState('24');

  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const minPeriod = utils.periodsAgo(Number(windowMonths || '0'));
  const eligible = wallet.attestations.filter((s) => s.attestation.period >= minPeriod);
  const couldProve = eligible
    .slice()
    .sort((a, b) => (a.attestation.onTime > b.attestation.onTime ? -1 : 1))
    .slice(0, 4)
    .reduce((sum, s) => sum + s.attestation.onTime, 0n);

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card
        title="Your identifier at a lender"
        lede="Before an institution can issue you anything, it needs a name for you. Amana gives every institution a different one, derived from your key and theirs. Two lenders comparing their books cannot tell they share a customer — and yet a proof can still add your records together."
      >
        <Field label="The institution's lender key" hint="They will have it on their Lender tab.">
          <input
            className="mono"
            value={lenderKey}
            placeholder="a3f1…"
            onChange={(e) => setLenderKey(e.target.value)}
          />
        </Field>
        <div className="actions">
          <ActionButton
            label="Generate my identifier"
            kind="ghost"
            disabled={lenderKey.trim().length !== 64}
            onRun={async () => setPseudonym(await api.subjectIdFor(lenderKey.trim()))}
            onError={setError}
          />
          {registry.lenders.length > 0 && (
            <select
              style={{ width: 'auto' }}
              value=""
              onChange={(e) => e.target.value && setLenderKey(e.target.value)}
            >
              <option value="">pick an admitted institution…</option>
              {registry.lenders.map((k) => (
                <option key={k} value={k}>
                  {k.slice(0, 16)}…
                </option>
              ))}
            </select>
          )}
        </div>
        {pseudonym && (
          <>
            <div className="kv" style={{ marginTop: 16 }}>
              <span className="k">Give them this</span>
              <span className="v">
                <Hash value={pseudonym} />
              </span>
            </div>
            <div className="hint">Click to copy. It is safe to send: it identifies you only to them.</div>
          </>
        )}
      </Card>

      <Card
        title="Accept a credential"
        lede="Paste what your lender gave you. It is stored on this device and nowhere else — if you clear this browser's storage, it is gone, because no server holds a copy."
      >
        <Field label="Credential">
          <textarea
            className="mono"
            value={credential}
            placeholder='{ "v": 1, … }'
            onChange={(e) => setCredential(e.target.value)}
          />
        </Field>
        <ActionButton
          label="Add to my wallet"
          kind="ghost"
          disabled={credential.trim().length === 0}
          onRun={async () => {
            const parsed = utils.decodeCredential(credential);
            await api.receiveAttestation(
              parsed.attestation as never,
              parsed.leafIndex,
              parsed.lenderName,
            );
            setCredential('');
          }}
          onError={setError}
          onDone={setOk}
          doneMessage="Credential added."
        />
      </Card>

      <Card title="Your record">
        <div className="stat-row" style={{ marginBottom: 18 }}>
          <Stat n={wallet.attestations.length} l="Credentials" />
          <Stat n={wallet.liveCount} l="Still live" />
          <Stat n={couldProve.toString()} l={`Provable in ${windowMonths}m`} />
        </div>

        {wallet.attestations.length === 0 ? (
          <div className="empty">
            No credentials yet. Ask a lender you have repaid to issue one.
          </div>
        ) : (
          wallet.attestations.map((s, i) => {
            const recent = s.attestation.period >= minPeriod;
            return (
              <div className="record" key={`${s.leafIndex}-${i}`}>
                <div className="body">
                  <div className="title">{s.lenderName}</div>
                  <div className="meta">
                    Last repaid {utils.formatPeriod(s.attestation.period)} · leaf #
                    {s.leafIndex.toString()}
                  </div>
                </div>
                {!recent && <Badge kind="neutral">outside window</Badge>}
                {s.live ? <Badge kind="live">live</Badge> : <Badge kind="dead">revoked</Badge>}
                <div className="ratio">
                  {s.attestation.onTime.toString()}
                  <span className="of"> / {s.attestation.total.toString()}</span>
                </div>
              </div>
            );
          })
        )}
      </Card>

      <Card
        title="Answer a check"
        lede="A lender assessing you hands you a check identifier out of band. Answering it proves you clear their bar and nothing else — not your total, not who you borrowed from, not how many records you used."
      >
        <Field label="Check identifier" hint="From the verifier's own tab.">
          <input
            className="mono"
            value={checkId}
            placeholder="9b04…"
            onChange={(e) => setCheckId(e.target.value)}
          />
        </Field>
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

        {couldProve < BigInt(minOnTime || '0') ? (
          <Notice kind="info">
            Your live credentials inside this window come to {couldProve.toString()} on-time
            repayments, short of the {minOnTime} required. Answering would fail in the circuit —
            which is checked here first so you do not spend a transaction finding out.
          </Notice>
        ) : (
          <Notice kind="ok">
            You can clear this bar. Amana will present the fewest credentials that do so.
          </Notice>
        )}

        <ActionButton
          label="Prove it"
          busyLabel="Building the proof…"
          disabled={checkId.trim().length !== 64 || couldProve < BigInt(minOnTime || '0')}
          onRun={() =>
            api.proveCreditStanding(checkId.trim(), BigInt(minOnTime), minPeriod)
          }
          onError={setError}
          onDone={setOk}
          doneMessage="Proved. The verifier can now read the outcome."
        />
      </Card>
    </>
  );
};
