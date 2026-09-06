// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import React, { useRef, useState } from 'react';
import type { AmanaAPI, AmanaDerivedState, CheckDraft, CheckOutcome } from '../../../api/src/index.js';
import { utils } from '../../../api/src/index.js';
import { ActionButton, Card, Field, Hash, Notice } from '../ui.jsx';

type SavedDraft = { draft: CheckDraft; minOnTime: string; minPeriod: string; maxPeriod: string };
export const VerifierView: React.FC<{ api: AmanaAPI; state: AmanaDerivedState }> = ({ api }) => {
  // Public draft only. Retain it when role tabs unmount this view.
  const storageKey = 'amana:check-draft:v2:' + api.deployedContractAddress;
  const [saved, setSaved] = useState<SavedDraft | null>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as SavedDraft | null;
      return s && utils.isHex32(s.draft.checkId) && utils.isHex32(s.draft.nonce)
        && utils.parseUint(s.minOnTime) !== null && utils.parseUint(s.minPeriod, 32) !== null
        && utils.parseUint(s.maxPeriod, 32) !== null ? s : null;
    } catch { return null; }
  });
  const [minOnTime, setMinOnTime] = useState('14'), [months, setMonths] = useState('24');
  const [recipient, setRecipient] = useState(''), [checkId, setCheckId] = useState(saved?.draft.checkId ?? '');
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null), [error, setError] = useState(''), [ok, setOk] = useState('');
  const lookup = useRef(0);
  const threshold = utils.parseUint(minOnTime), window = utils.parseUint(months);
  const valid = threshold !== null && threshold > 0n && window !== null && window > 0n && window <= utils.currentPeriod() + 1n;
  return <>
    {error && <Notice kind="error">{error}</Notice>}{ok && <Notice kind="ok">{ok}</Notice>}
    <Card title="1. Prepare a check" lede="Choose a threshold and reporting window. Send the generated ID to your applicant, then collect their response key through your existing application channel.">
      <div className="field-row">
        <Field label="On-time repayments required"><input value={minOnTime} inputMode="numeric" onChange={(e) => setMinOnTime(e.target.value)} /></Field>
        <Field label="Calendar months, including this month"><input value={months} inputMode="numeric" onChange={(e) => setMonths(e.target.value)} /></Field>
      </div>
      <ActionButton label="Prepare new check" disabled={!valid} onRun={async () => {
        const max = utils.currentPeriod();
        const s: SavedDraft = { draft: await api.draftCheck(), minOnTime: threshold!.toString(),
          minPeriod: (max - window! + 1n).toString(), maxPeriod: max.toString() };
        localStorage.setItem(storageKey, JSON.stringify(s)); setSaved(s);
        lookup.current++; setCheckId(s.draft.checkId); setRecipient(''); setOutcome(null); setOk('');
      }} onError={setError} />
      {saved && <>
        <div className="kv"><span className="k">Send this check ID</span><Hash value={saved.draft.checkId} /></div>
        <div className="hint">Prepared terms: {saved.minOnTime} on-time repayments, {utils.formatPeriod(BigInt(saved.minPeriod))} – {utils.formatPeriod(BigInt(saved.maxPeriod))}. Editing the fields above requires preparing a new check.</div>
      </>}
    </Card>
    {saved && <Card title="2. Commit the applicant and terms" lede="The response key binds this check to the applicant's wallet. Authenticate its sender; the protocol does not verify their real-world identity.">
      <Field label="Applicant response key"><input className="mono" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></Field>
      <ActionButton label="Create check on chain" busyLabel="Committing check…" disabled={!utils.isHex32(recipient.trim())}
        onRun={async () => {
          await api.createCheck(saved.draft, { minOnTime: BigInt(saved.minOnTime), minPeriod: BigInt(saved.minPeriod), maxPeriod: BigInt(saved.maxPeriod) }, recipient.trim());
          lookup.current++; setCheckId(saved.draft.checkId); setOutcome(await api.readCheck(saved.draft.checkId));
        }} onError={setError} onDone={setOk} doneMessage="Check created. Ask the applicant to load it, review the terms, and prove." />
    </Card>}
    <Card title="3. Read a check" lede="The result below uses the terms committed on chain. An accepted result describes credentials live when the proof was accepted; later revocation does not erase that historical result.">
      <Field label="Check identifier"><input className="mono" value={checkId} onChange={(e) => {
        lookup.current++; setCheckId(e.target.value); setOutcome(null); setOk('');
      }} /></Field>
      <ActionButton label="Read committed check" kind="ghost" disabled={!utils.isHex32(checkId.trim())}
        onRun={async () => { const n = ++lookup.current; const o = await api.readCheck(checkId.trim()); if (n === lookup.current) setOutcome(o); }} onError={setError} />
      {outcome && <>
        <Notice kind={outcome.answered ? 'ok' : 'info'}>
          {outcome.answered ? 'This check cleared.' : outcome.exists ? 'Committed; awaiting the bound borrower.' : 'No committed check with this ID.'}
        </Notice>
        {outcome.terms && <>
          <div className="kv"><span className="k">Required on-time repayments</span><span className="v">{outcome.terms.minOnTime.toString()}</span></div>
          <div className="kv"><span className="k">Reporting window</span><span className="v">{utils.formatPeriod(outcome.terms.minPeriod)} – {utils.formatPeriod(outcome.terms.maxPeriod)}</span></div>
          <div className="kv"><span className="k">Requesting verifier</span><Hash value={utils.bytesToHex(outcome.terms.verifier)} /></div>
          <div className="kv"><span className="k">Bound response key</span><Hash value={utils.bytesToHex(outcome.terms.recipient)} /></div>
        </>}
        {outcome.result && <><div className="kv"><span className="k">Nullifier</span><Hash value={utils.bytesToHex(outcome.result.nullifier)} /></div>
          <div className="hint">This result reveals the threshold, not the actual count, contributing lenders, or number of summaries. It does not establish affordability, absence of debt, or factual truth beyond the admitted issuers' statements.</div></>}
      </>}
    </Card>
  </>;
};
