// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The issuing institution: turn a borrower's repayment history into a
 * record the borrower holds, and revoke one when it no longer stands.
 */

import React, { useMemo, useState } from 'react';
import { Ban, Check, Download, FilePlus2, Inbox, Landmark, Send } from 'lucide-react';

import type { AmanaDerivedState } from '../../../../api/src/index.js';
import { utils } from '../../../../api/src/index.js';
import { EXPECTED_SECONDS, type AmanaClient } from '../../client.js';
import {
  Alert,
  Button,
  CopyButton,
  CredentialCard,
  EmptyState,
  Field,
  Input,
  MonthInput,
  NumberInput,
  PageHeader,
  Panel,
  PrivacySplit,
  ShareValue,
  StatusPill,
  TechDetails,
  TechRow,
  Textarea,
  TxDialog,
  TxProgress,
} from '../../components/index.js';
import { count, remember } from '../../format.js';
import { useTransaction } from '../../transactions.js';
import './issuer.css';

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const IssuerView: React.FC<{ api: AmanaClient; state: AmanaDerivedState }> = ({ api, state }) => {
  const { registry, identity } = state;
  const nameKey = `amana:institution-name:${api.deployedContractAddress}`;

  const [subject, setSubject] = useState('');
  const [onTime, setOnTime] = useState('12');
  const [total, setTotal] = useState('12');
  const [from, setFrom] = useState(() => utils.periodsAgo(12));
  const [to, setTo] = useState(() => utils.periodsAgo(1));
  const [name, setName] = useState(() => remember.get(nameKey) ?? '');
  const [issued, setIssued] = useState<{ leaf: bigint; credential: string } | null>(null);
  const [revoking, setRevoking] = useState<bigint | null>(null);
  const issue = useTransaction();

  // Leaves this device issued that are still live.
  const mine = useMemo(
    () =>
      [...registry.issuers.entries()]
        .filter(([, lender]) => lender === identity.lenderKey)
        .map(([leaf]) => leaf)
        .sort((a, b) => Number(b - a)),
    [registry.issuers, identity.lenderKey],
  );

  const n = utils.parseUint(onTime);
  const t = utils.parseUint(total);
  const subjectOk = utils.isHex32(subject.trim());
  const countError = n !== null && t !== null && n > t ? 'On time cannot exceed scheduled. The contract refuses it too.' : undefined;
  const rangeError = from > to ? 'The first month must not come after the last.' : undefined;
  const nameError = name.length > 160 ? 'Use 160 characters or fewer.' : undefined;
  const label = name.trim() || 'Unnamed institution';
  const valid =
    subjectOk && n !== null && t !== null && t > 0n && !countError && !rangeError && !nameError && identity.isRegisteredLender;

  const submit = () =>
    void issue
      .run(() =>
        api.issueAttestation({ subject: subject.trim(), onTime: n!, total: t!, periodStart: from, periodEnd: to }),
      )
      .then((r) => {
        if (!r) return;
        remember.set(nameKey, name.trim() || null);
        setIssued({
          leaf: r.leafIndex,
          credential: utils.encodeCredential(r.attestation, r.leafIndex, label, api.deployedContractAddress),
        });
        setSubject('');
      });

  return (
    <div className="role-screen issuer">
      <PageHeader
        eyebrow="Issuing institution"
        title="Issue repayment records"
        lede="Turn a borrower’s repayment history with you into a record they hold. The chain receives one opaque fingerprint; the borrower carries the rest."
      />

      <section className={`institution ${identity.isRegisteredLender ? 'is-admitted' : 'is-pending'}`} aria-labelledby="inst-title">
        <span className="institution-icon" aria-hidden>
          <Landmark size={22} />
        </span>
        <div className="institution-main">
          <h2 id="inst-title">
            {name.trim() || 'This institution'}{' '}
            {identity.isRegisteredLender ? (
              <StatusPill tone="live">Admitted to issue</StatusPill>
            ) : (
              <StatusPill tone="neutral">Not admitted yet</StatusPill>
            )}
          </h2>
          <p>
            {identity.isRegisteredLender
              ? `The registry operator admitted this key. ${count(mine.length, 'record')} issued from here ${mine.length === 1 ? 'is' : 'are'} live.`
              : 'Send the key below to the registry operator. Until they admit it, the contract refuses anything you issue.'}
          </p>
        </div>
        <div className="institution-key">
          {identity.isRegisteredLender ? (
            <>
              <span className="institution-key-label">Institution key</span>
              <code title={identity.lenderKey}>{identity.lenderKey.slice(0, 10)}…{identity.lenderKey.slice(-8)}</code>
              <CopyButton compact value={identity.lenderKey} label="Copy institution key" />
            </>
          ) : null}
        </div>
        {!identity.isRegisteredLender && (
          <div className="institution-share">
            <ShareValue
              label="Your institution key"
              value={identity.lenderKey}
              hint="Borrowers also need it, to create their identifier for you."
            />
          </div>
        )}
      </section>

      <Panel
        tone="raised"
        icon={<FilePlus2 size={18} />}
        title="Issue a record"
        description="Counts and months are read by the circuit as private input. None of them is a transaction argument."
      >
        {issued ? (
          <div className="handover">
            <Alert tone="success" title={`Record #${issued.leaf.toString()} issued`}>
              Hand it to the borrower now. It is the record itself, not a link to one: once they hold it, neither you nor
              anyone else can see where they use it.
            </Alert>
            <Field label="The record, for the borrower">
              <Textarea mono readOnly rows={8} value={issued.credential} />
            </Field>
            <div className="handover-actions">
              <CopyButton value={issued.credential} label="Copy record" variant="secondary" />
              <Button
                variant="secondary"
                size="sm"
                icon={<Download size={15} aria-hidden />}
                onClick={() => download(`amana-record-${issued.leaf.toString()}.json`, issued.credential)}
              >
                Download file
              </Button>
              <Button
                size="sm"
                icon={<Check size={15} aria-hidden />}
                onClick={() => {
                  setIssued(null);
                  issue.reset();
                }}
              >
                Done, issue another
              </Button>
            </div>
            <p className="handover-note">
              This page does not keep a copy. Send it through the channel you already use with this borrower.
            </p>
          </div>
        ) : (
          <div className="issue">
            <form
              className="issue-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) submit();
              }}
            >
              {!identity.isRegisteredLender && (
                <Alert tone="warning" title="Not admitted yet">
                  You can fill this in, but issuing waits until the registry operator admits your institution key.
                </Alert>
              )}
              <Field
                label="Borrower’s identifier for your institution"
                hint="The borrower creates it in their passport, for your institution only. It is different at every institution."
                error={subject.trim() && !subjectOk ? 'That is not a 64-character identifier.' : undefined}
              >
                <Input
                  mono
                  value={subject}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Paste the borrower’s identifier"
                  onChange={(e) => setSubject(e.target.value)}
                />
              </Field>
              <div className="issue-pair">
                <Field label="Repayments on time" error={countError}>
                  <NumberInput value={onTime} onChange={setOnTime} />
                </Field>
                <Field label="Repayments scheduled">
                  <NumberInput value={total} onChange={setTotal} min={1} />
                </Field>
              </div>
              <div className="issue-pair">
                <Field label="First month covered" error={rangeError}>
                  <MonthInput value={from} onChange={setFrom} />
                </Field>
                <Field label="Last month covered">
                  <MonthInput value={to} onChange={setTo} />
                </Field>
              </div>
              <Field
                label="Institution name shown to the borrower"
                optional
                hint="A label in the borrower’s passport. Not published on chain."
                error={nameError}
              >
                <Input value={name} placeholder="Your institution’s name" onChange={(e) => setName(e.target.value)} />
              </Field>

              {issue.status.phase === 'idle' ? (
                <div className="issue-actions">
                  <Button type="submit" icon={<Send size={16} aria-hidden />} disabled={!valid}>
                    Issue record
                  </Button>
                  <p>About {EXPECTED_SECONDS.transaction} seconds. Count only repayments that fall inside these months.</p>
                </div>
              ) : (
                <TxProgress
                  status={issue.status}
                  title="Issuing the record"
                  expectedSeconds={EXPECTED_SECONDS.transaction}
                  stages={{ prove: { detail: 'Your proof server proves the record is well formed without revealing it.' } }}
                  onRetry={submit}
                  onDismiss={issue.reset}
                />
              )}
            </form>

            <section className="issue-preview" aria-label="Preview of the record">
              <p className="issue-preview-label">What the borrower will hold</p>
              <CredentialCard
                institution={label}
                onTime={n ?? 0n}
                total={t ?? 0n}
                from={from}
                to={to}
                live
                held={false}
              />
              <PrivacySplit
                seesTitle="Published on chain"
                keepsTitle="Only the borrower receives"
                sees={[
                  { label: 'One opaque fingerprint of the record' },
                  { label: 'That your institution issued it, and when' },
                ]}
                keeps={[
                  { label: 'Who the borrower is' },
                  { label: 'The counts and the months' },
                  { label: 'Your institution’s name' },
                ]}
              />
            </section>
          </div>
        )}
      </Panel>

      <section aria-labelledby="issued-title">
        <header className="section-head">
          <h2 id="issued-title">Live records issued here</h2>
          <span className="section-count">{count(mine.length, 'record')}</span>
        </header>
        {mine.length === 0 ? (
          <EmptyState icon={<Inbox size={24} />} title="Nothing issued from this institution yet">
            Records you issue appear here while they are live, so you can revoke one that no longer stands.
          </EmptyState>
        ) : (
          <ul className="leaf-list">
            {mine.map((leaf) => (
              <li key={leaf.toString()}>
                <span className="leaf-badge num" aria-hidden>
                  #{leaf.toString()}
                </span>
                <div className="leaf-main">
                  <span className="leaf-title">Record #{leaf.toString()}</span>
                  <span className="leaf-meta">Its fingerprint is in the registry. The details are with the borrower.</span>
                </div>
                <StatusPill tone="live">Live</StatusPill>
                <Button variant="danger" size="sm" icon={<Ban size={14} aria-hidden />} onClick={() => setRevoking(leaf)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="list-note">Revoked records leave this list. The registry keeps count of them.</p>
      </section>

      <TxDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        tone="danger"
        icon={<Ban size={20} />}
        title={`Revoke record #${revoking?.toString() ?? ''}?`}
        description="The borrower will no longer be able to use it in a proof. Checks it already helped answer stay answered. Nothing published says whose record it was."
        confirmLabel="Revoke record"
        cancelLabel="Keep it"
        run={() => api.revokeAttestation(revoking ?? 0n)}
        progressTitle="Revoking the record"
        expectedSeconds={EXPECTED_SECONDS.transaction}
        successTitle="Record revoked"
        successBody="Proofs can no longer use it."
      />

      <TechDetails>
        <TechRow label="Institution key" note="lender key" value={identity.lenderKey} />
        <TechRow label="Next free leaf" value={registry.nextLeaf.toString()} copy={false} />
      </TechDetails>
    </div>
  );
};
