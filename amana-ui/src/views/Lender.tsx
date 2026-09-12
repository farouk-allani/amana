// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import type { AmanaAPI, AmanaDerivedState } from '../../../api/src/index.js';
import { utils } from '../../../api/src/index.js';
import { ActionButton, Badge, Card, Field, Hash, Notice } from '../ui.jsx';

export const LenderView: React.FC<{ api: AmanaAPI; state: AmanaDerivedState }> = ({
  api,
  state,
}) => {
  const { registry, identity } = state;

  const [institution, setInstitution] = useState('Demo lender A');
  const [subject, setSubject] = useState('');
  const [onTime, setOnTime] = useState('14');
  const [total, setTotal] = useState('14');
  const [periodStart, setPeriodStart] = useState(() => utils.periodsAgo(23).toString());
  const [periodEnd, setPeriodEnd] = useState(() => utils.currentPeriod().toString());

  const [credential, setCredential] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // Leaves issued by this device, newest first.
  const mine = [...registry.issuers.entries()]
    .filter(([, lender]) => lender === identity.lenderKey)
    .sort((a, b) => Number(b[0] - a[0]));

  const count = utils.parseUint(onTime), scheduled = utils.parseUint(total);
  const start = utils.parseUint(periodStart, 32), end = utils.parseUint(periodEnd, 32);
  const valid = utils.isHex32(subject.trim()) && count !== null && scheduled !== null
    && count <= scheduled && start !== null && end !== null && start <= end && institution.length <= 160;

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="This institution">
        <div className="kv">
          <span className="k">Lender key</span>
          <span className="v">
            <Hash value={identity.lenderKey} />
          </span>
        </div>
        <div className="kv">
          <span className="k">Status</span>
          <span className="v">
            {identity.isRegisteredLender ? (
              <Badge kind="live">admitted</Badge>
            ) : (
              <Badge kind="dead">not admitted</Badge>
            )}
          </span>
        </div>
        {!identity.isRegisteredLender && (
          <div className="hint" style={{ marginTop: 12 }}>
            Send the lender key above to the registry authority. Until they admit it, the contract
            will refuse anything you try to issue.
          </div>
        )}
      </Card>

      <Card
        title="Issue an attestation"
        lede="The borrower gives you the pseudonym they generated for your institution specifically. What reaches the chain is a single hash. The counts and dates below are consumed by the circuit as private state and are never transaction inputs."
      >
        <Field
          label="Borrower's pseudonym at your institution"
          hint="From the borrower's own wallet. It is unique to you: the same borrower shows a different, unlinkable identifier to every lender."
        >
          <input
            className="mono"
            value={subject}
            placeholder="7c2e…"
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>

        <div className="field-row">
          <Field label="On time within this interval">
            <input value={onTime} inputMode="numeric" onChange={(e) => setOnTime(e.target.value)} />
          </Field>
          <Field label="Scheduled within this interval">
            <input value={total} inputMode="numeric" onChange={(e) => setTotal(e.target.value)} />
          </Field>
          <Field label="Reporting start month" hint={start === null ? 'Month index since Jan 1970' : utils.formatPeriod(start)}>
            <input value={periodStart} inputMode="numeric" onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          <Field label="Reporting end month" hint={end === null ? 'Month index since Jan 1970' : utils.formatPeriod(end)}>
            <input value={periodEnd} inputMode="numeric" onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
        </div>

        <Field label="Your institution's name" hint="A label for the borrower's own records. Not committed on chain.">
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} />
        </Field>

        {count !== null && scheduled !== null && count > scheduled && (
          <Notice kind="error">
            On-time repayments cannot exceed the number scheduled. The circuit enforces this too:
            it would reject the transaction.
          </Notice>
        )}

        <ActionButton
          label="Issue attestation"
          busyLabel="Proving and submitting…"
          disabled={!valid || !identity.isRegisteredLender}
          onRun={async () => {
            const issued = await api.issueAttestation({
              subject: subject.trim(),
              onTime: BigInt(onTime),
              total: BigInt(total),
              periodStart: BigInt(periodStart),
              periodEnd: BigInt(periodEnd),
            });
            setCredential(
              utils.encodeCredential(issued.attestation, issued.leafIndex, institution, api.deployedContractAddress),
            );
            setSubject('');
          }}
          onError={setError}
          onDone={setOk}
          doneMessage="Attestation issued. Hand the credential below to the borrower."
        />
      </Card>

      {credential && (
        <Card
          title="Hand this to the borrower"
          lede="This blob is the credential. It is not a pointer to a record on our server. It is the record. Once the borrower holds it, you cannot see where they present it, and neither can we."
        >
          <textarea className="mono" readOnly value={credential} style={{ minHeight: 190 }} />
          <div className="actions">
            <button
              className="btn ghost"
              onClick={() => void navigator.clipboard.writeText(credential)}
            >
              Copy credential
            </button>
            <button className="btn ghost" onClick={() => setCredential('')}>
              Done
            </button>
          </div>
        </Card>
      )}

      <Card
        title="Issued by this institution"
        lede="Revoking overwrites the leaf in the attestation tree. Future proofs using this leaf fail; previously accepted checks remain historical results, with nothing published about whose record it was."
      >
        {mine.length === 0 ? (
          <div className="empty">Nothing issued from this device yet.</div>
        ) : (
          mine.map(([leafIndex]) => (
            <div className="record" key={leafIndex.toString()}>
              <div className="body">
                <div className="title">Leaf #{leafIndex.toString()}</div>
                <div className="meta">Commitment held in the attestation tree</div>
              </div>
              <ActionButton
                label="Revoke"
                busyLabel="Revoking…"
                kind="danger"
                tiny
                onRun={() => api.revokeAttestation(leafIndex)}
                onError={setError}
                onDone={setOk}
                doneMessage={`Leaf #${leafIndex.toString()} revoked.`}
              />
            </div>
          ))
        )}
      </Card>
    </>
  );
};
