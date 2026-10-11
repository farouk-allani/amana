// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The borrower's repayment passport: the records they hold, what those
 * records let them prove, and answering a lender's check.
 */

import React, { useMemo, useState } from 'react';
import { FilePlus2, Fingerprint, IdCard, LockKeyhole } from 'lucide-react';

import type { AmanaDerivedState } from '../../../../api/src/index.js';
import { utils } from '../../../../api/src/index.js';
import type { AmanaClient } from '../../client.js';
import {
  Alert,
  BrandMark,
  Button,
  CredentialCard,
  EmptyState,
  PageHeader,
  Panel,
  TechDetails,
  TechRow,
} from '../../components/index.js';
import { count, span } from '../../format.js';
import { AnswerCheck } from './AnswerCheck.jsx';
import { AddRecordDialog, ShareIdentifierDialog } from './dialogs.jsx';
import './borrower.css';

export const BorrowerView: React.FC<{ api: AmanaClient; state: AmanaDerivedState }> = ({ api, state }) => {
  const [sharing, setSharing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const records = state.wallet.attestations;
  const live = useMemo(() => records.filter((r) => r.live), [records]);
  const revoked = records.length - live.length;
  const institutions = new Set(live.map((r) => utils.bytesToHex(r.attestation.lender))).size;
  const earliest = live.reduce<bigint | null>((m, r) => (m === null || r.attestation.periodStart < m ? r.attestation.periodStart : m), null);
  const latest = live.reduce<bigint | null>((m, r) => (m === null || r.attestation.periodEnd > m ? r.attestation.periodEnd : m), null);

  // Live records first, in the order they were issued.
  const ordered = useMemo(
    () => [...records].sort((a, b) => (a.live === b.live ? Number(a.leafIndex - b.leafIndex) : a.live ? -1 : 1)),
    [records],
  );

  const actions = (
    <>
      <Button variant="secondary" icon={<Fingerprint size={16} aria-hidden />} onClick={() => setSharing(true)}>
        Share my identifier
      </Button>
      <Button icon={<FilePlus2 size={16} aria-hidden />} onClick={() => setAdding(true)}>
        Add a record
      </Button>
    </>
  );

  return (
    <div className="borrower">
      <PageHeader
        eyebrow="Borrower"
        title="Your repayment passport"
        lede="Records from institutions you have repaid, held only on this device. Prove what a lender asks without showing them the records."
        actions={actions}
      />

      {added && (
        <Alert tone="success" title="Record added to your passport" onDismiss={() => setAdded(false)}>
          It counts toward what you can prove from now on.
        </Alert>
      )}

      <section className="passport" aria-labelledby="passport-figure">
        <div className="passport-art" aria-hidden>
          <BrandMark size={260} />
        </div>
        <div className="passport-main">
          <p className="passport-label">You can prove</p>
          <p className="passport-figure" id="passport-figure">
            <span className="num">{state.wallet.provableOnTime.toString()}</span>
            <span className="passport-unit">on-time repayments</span>
          </p>
          <p className="passport-sub">
            {live.length === 0
              ? 'Add a record from an institution you have repaid to start.'
              : `From ${count(institutions, 'institution')}${earliest !== null && latest !== null ? `, ${span(earliest, latest)}` : ''}. At most one record per institution counts, up to four.`}
          </p>
        </div>
        <dl className="passport-stats">
          <div>
            <dt>Live</dt>
            <dd className="num">{live.length}</dd>
          </div>
          <div>
            <dt>Revoked</dt>
            <dd className="num">{revoked}</dd>
          </div>
          <div>
            <dt>Institutions</dt>
            <dd className="num">{institutions}</dd>
          </div>
        </dl>
        <p className="passport-private">
          <LockKeyhole size={15} aria-hidden />
          No institution can see this total. A proof tells a lender only whether you clear the bar they set.
        </p>
      </section>

      <section className="records" aria-labelledby="records-title">
        <header className="section-head">
          <h2 id="records-title">Records</h2>
          <span className="section-count">{count(records.length, 'record')}</span>
        </header>
        {records.length === 0 ? (
          <EmptyState
            icon={<IdCard size={24} />}
            title="Your passport is empty"
            action={
              <>
                <Button variant="secondary" icon={<Fingerprint size={16} aria-hidden />} onClick={() => setSharing(true)}>
                  Share my identifier
                </Button>
                <Button icon={<FilePlus2 size={16} aria-hidden />} onClick={() => setAdding(true)}>
                  Add a record
                </Button>
              </>
            }
          >
            Ask an institution you have repaid to issue you a record. First give them your identifier for that
            institution; when they send the record back, add it here.
          </EmptyState>
        ) : (
          <div className="records-grid">
            {ordered.map((r) => (
              <CredentialCard
                key={r.leafIndex.toString()}
                institution={r.lenderName}
                onTime={r.attestation.onTime}
                total={r.attestation.total}
                from={r.attestation.periodStart}
                to={r.attestation.periodEnd}
                live={r.live}
              >
                <TechDetails>
                  <TechRow label="Record number" note="leaf index" value={r.leafIndex.toString()} copy={false} />
                  <TechRow label="Issuing institution" note="registry key" value={utils.bytesToHex(r.attestation.lender)} />
                  <TechRow label="Your identifier there" note="pseudonym" value={utils.bytesToHex(r.attestation.subject)} />
                </TechDetails>
              </CredentialCard>
            ))}
          </div>
        )}
      </section>

      <Panel
        title="Answer a credit check"
        description="When a lender asks about your repayment record, you answer here. You will see what they learn, and what they don't, before you prove anything."
        icon={<IdCard size={18} />}
        tone="raised"
      >
        <AnswerCheck api={api} state={state} />
      </Panel>

      <ShareIdentifierDialog api={api} open={sharing} onClose={() => setSharing(false)} />
      <AddRecordDialog api={api} open={adding} onClose={() => setAdding(false)} onAdded={() => setAdded(true)} />
    </div>
  );
};
