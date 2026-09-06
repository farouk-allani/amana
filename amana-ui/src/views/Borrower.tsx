// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import React, { useRef, useState } from 'react';
import type { AmanaAPI, AmanaDerivedState, CheckOutcome } from '../../../api/src/index.js';
import { utils } from '../../../api/src/index.js';
import { provableTotal } from '../../../contract/src/witnesses.js';
import { ActionButton, Badge, Card, Field, Hash, Notice, Stat } from '../ui.jsx';

export const BorrowerView: React.FC<{ api: AmanaAPI; state: AmanaDerivedState }> = ({ api, state }) => {
  const [lenderKey, setLenderKey] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [credential, setCredential] = useState('');
  const [checkId, setCheckId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const lookup = useRef(0);
  const terms = outcome?.terms;
  const couldProve = terms ? provableTotal(state.wallet.attestations.filter((s) => s.live), terms.minPeriod, terms.maxPeriod) : 0n;
  const addressedToMe = !!terms && utils.bytesToHex(terms.recipient) === recipient;
  return <>
    {error && <Notice kind="error">{error}</Notice>}
    {ok && <Notice kind="ok">{ok}</Notice>}
    <Card title="Your identifier at a lender" lede="Each lender gets a different pseudonym. Your existing account relationship can still identify you to that lender.">
      <Field label="Institution lender key"><input className="mono" value={lenderKey} onChange={(e) => { setLenderKey(e.target.value); setPseudonym(''); }} /></Field>
      <ActionButton label="Generate my identifier" kind="ghost" disabled={!utils.isHex32(lenderKey.trim())}
        onRun={async () => setPseudonym(await api.subjectIdFor(lenderKey.trim()))} onError={setError} />
      {pseudonym && <div className="kv"><span className="k">Send to this lender</span><Hash value={pseudonym} /></div>}
    </Card>
    <Card title="Accept a credential" lede="Credentials and your identity key are stored unencrypted in this browser. Keep this device secure and use a trusted proof server.">
      <Field label="Version 2 credential"><textarea className="mono" value={credential} onChange={(e) => setCredential(e.target.value)} /></Field>
      <ActionButton label="Add to my wallet" kind="ghost" disabled={!credential.trim()}
        onRun={async () => { await api.importCredential(credential); setCredential(''); }}
        onError={setError} onDone={setOk} doneMessage="Credential added." />
    </Card>
    <Card title="Your repayment summaries">
      <div className="stat-row"><Stat n={state.wallet.attestations.length} l="Credentials" /><Stat n={state.wallet.liveCount} l="Live" /></div>
      {state.wallet.attestations.length === 0 && <div className="empty">Ask a lender you have repaid to issue a summary.</div>}
      {state.wallet.attestations.map((s) => <div className="record" key={s.leafIndex.toString()}>
        <div className="body"><div className="title">{s.lenderName}</div>
          <div className="meta">{utils.formatPeriod(s.attestation.periodStart)} – {utils.formatPeriod(s.attestation.periodEnd)} · leaf #{s.leafIndex.toString()}</div></div>
        <Badge kind={s.live ? 'live' : 'dead'}>{s.live ? 'live' : 'not live'}</Badge>
        <div className="ratio">{s.attestation.onTime.toString()}<span className="of"> / {s.attestation.total.toString()}</span></div>
      </div>)}
    </Card>
    <Card title="1. Bind a check to your wallet" lede="Receive a check ID from your verifier. Send back the response key through the channel you use for this application. It is unique to this check.">
      <Field label="Check identifier"><input className="mono" value={checkId} onChange={(e) => {
        lookup.current++; setCheckId(e.target.value); setRecipient(''); setOutcome(null); setError(''); setOk('');
      }} /></Field>
      <ActionButton label="Generate response key" kind="ghost" disabled={!utils.isHex32(checkId.trim())}
        onRun={async () => { const n = ++lookup.current; const r = await api.checkRecipientFor(checkId.trim()); if (n === lookup.current) setRecipient(r); }} onError={setError} />
      {recipient && <div className="kv"><span className="k">Send to the verifier</span><Hash value={recipient} /></div>}
    </Card>
    <Card title="2. Review committed terms and prove" lede="After receiving your response key, the verifier creates the check on chain. Load those terms before consenting to publish the result.">
      <ActionButton label="Load committed check" kind="ghost" disabled={!utils.isHex32(checkId.trim())}
        onRun={async () => {
          const n = ++lookup.current, id = checkId.trim();
          const [o, r] = await Promise.all([api.readCheck(id), api.checkRecipientFor(id)]);
          if (n === lookup.current) { setOutcome(o); setRecipient(r); }
        }} onError={setError} />
      {outcome && !outcome.exists && <Notice kind="info">The verifier has not created this check yet. Send them your response key.</Notice>}
      {terms && <>
        <div className="kv"><span className="k">Required on-time repayments</span><span className="v">{terms.minOnTime.toString()}</span></div>
        <div className="kv"><span className="k">Inclusive reporting window</span><span className="v">{utils.formatPeriod(terms.minPeriod)} – {utils.formatPeriod(terms.maxPeriod)}</span></div>
        <div className="kv"><span className="k">Verifier key</span><Hash value={utils.bytesToHex(terms.verifier)} /></div>
        {!addressedToMe ? <Notice kind="error">This check is bound to a different wallet.</Notice>
          : outcome?.answered ? <Notice kind="ok">This check has already been answered.</Notice>
          : <Notice kind={couldProve >= terms.minOnTime ? 'info' : 'error'}>
              Your eligible live summaries support {couldProve.toString()} on-time repayments.
              Only one summary per lender and at most four lenders can contribute.
              Proving publishes the required threshold and reporting window, plus a check-specific nullifier.
            </Notice>}
        <ActionButton label="Consent and prove" busyLabel="Building the proof…"
          disabled={!addressedToMe || outcome?.answered || couldProve < terms.minOnTime}
          onRun={async () => {
            const n = lookup.current, id = outcome!.checkId;
            await api.proveCreditStanding(id);
            const refreshed = await api.readCheck(id);
            if (n === lookup.current) setOutcome(refreshed);
          }} onError={setError} onDone={setOk} doneMessage="Proof accepted. The verifier can read this check's result." />
      </>}
    </Card>
  </>;
};
