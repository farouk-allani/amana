// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Development only: every shared component in its states, on one page, for
 * checking at desktop and phone widths. Open with `?gallery` under
 * `npm run ui`. Never part of a production build.
 */

import React, { useState } from 'react';
import { FilePlus2, Inbox, Landmark, ShieldCheck, Trash2 } from 'lucide-react';

import {
  Alert,
  Button,
  ChoiceChips,
  CopyButton,
  CredentialCard,
  Dialog,
  EmptyState,
  ErrorAlert,
  Facts,
  Field,
  Input,
  Metric,
  MonthInput,
  NumberInput,
  PageHeader,
  Panel,
  PrivacySplit,
  Receipt,
  ShareValue,
  StatusPill,
  Stepper,
  TechDetails,
  TechRow,
  Textarea,
  TxProgress,
} from '../components/index.js';
import type { TxStatus } from '../transactions.js';

const HEX = '7c2e41d09a3be0f1c55d2a9e04b7716f3e8d2c0a9b1f4e6d8c7a5b3e2f1d0c9a';
const now = Date.now();

const TX_SAMPLES: { label: string; status: TxStatus }[] = [
  { label: 'Proving', status: { phase: 'running', stage: 'prove', startedAt: now - 42_000 } },
  { label: 'Approving', status: { phase: 'running', stage: 'approve', startedAt: now - 88_000 } },
  {
    label: 'Failed',
    status: {
      phase: 'failed',
      stage: 'prove',
      error: new Error('Failed Proof Server response: url="http://localhost:6300/prove", code="502"'),
      startedAt: now - 30_000,
      finishedAt: now - 2_000,
    },
  },
  { label: 'Done', status: { phase: 'done', startedAt: now - 97_000, finishedAt: now } },
];

export const Gallery: React.FC = () => {
  const [threshold, setThreshold] = useState('14');
  const [months, setMonths] = useState<'12' | '24' | '36'>('24');
  const [period, setPeriod] = useState(BigInt((2025 - 1970) * 12));
  const [dialog, setDialog] = useState(false);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 16px 96px', display: 'grid', gap: 32 }}>
      <PageHeader
        eyebrow="Development"
        title="Component gallery"
        lede="Every shared component, in its states. Sample values only."
        actions={<Button icon={<FilePlus2 size={16} aria-hidden />}>Primary action</Button>}
      />

      <Panel title="Buttons" description="Primary, secondary, ghost and danger, in three sizes.">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button>Prove privately</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={<Trash2 size={15} aria-hidden />}>
            Revoke
          </Button>
          <Button loading>Working</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm" variant="secondary">
            Small
          </Button>
          <Button size="lg">Large</Button>
          <CopyButton value={HEX} label="Copy key" variant="secondary" />
          <CopyButton value={HEX} compact label="Copy key" />
        </div>
      </Panel>

      <Panel title="Status and metrics">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatusPill tone="live">Live</StatusPill>
          <StatusPill tone="revoked">Revoked</StatusPill>
          <StatusPill tone="pending" pulse>
            Awaiting proof
          </StatusPill>
          <StatusPill tone="gold">Authority</StatusPill>
          <StatusPill tone="info">Committed</StatusPill>
          <StatusPill tone="neutral">Not admitted</StatusPill>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Metric label="Institutions" value="2" icon={<Landmark size={16} />} sub="admitted to issue" />
          <Metric label="Records issued" value="3" />
          <Metric label="Checks answered" value="1" icon={<ShieldCheck size={16} />} />
        </div>
        <div style={{ marginTop: 20 }}>
          <Facts
            items={[
              { label: 'Required', value: '14 on-time repayments' },
              { label: 'Window', value: 'Oct 2024 – Sep 2026' },
            ]}
          />
        </div>
      </Panel>

      <Panel title="Fields">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          <Field label="Check ID" hint="64 hexadecimal characters, from the verifier.">
            <Input mono placeholder="7c2e…" />
          </Field>
          <Field label="Institution name" error="Use 160 characters or fewer.">
            <Input defaultValue="Institution A" />
          </Field>
          <Field label="On-time repayments required">
            <NumberInput value={threshold} onChange={setThreshold} min={1} />
          </Field>
          <Field label="First month covered">
            <MonthInput value={period} onChange={setPeriod} />
          </Field>
          <ChoiceChips
            legend="Look back over"
            value={months}
            onChange={setMonths}
            options={[
              { value: '12', label: '12 months' },
              { value: '24', label: '24 months' },
              { value: '36', label: '36 months' },
            ]}
          />
          <Field label="Record from your institution" optional>
            <Textarea mono placeholder="{ … }" />
          </Field>
        </div>
        <div style={{ marginTop: 20 }}>
          <ShareValue label="Send this to the verifier" value={HEX} hint="It only works for this one check." />
        </div>
      </Panel>

      <Panel title="Alerts and empty states">
        <div style={{ display: 'grid', gap: 12 }}>
          <Alert tone="info" title="The verifier has not committed this check yet">
            Send them your response key, then come back.
          </Alert>
          <Alert tone="success" title="Record added to your passport" onDismiss={() => undefined} />
          <Alert tone="warning" title="Private data is stored unencrypted">
            Anyone with access to this browser profile can read it.
          </Alert>
          <ErrorAlert error={new Error('failed assert: only the issuing lender may revoke')} onDismiss={() => undefined} />
          <EmptyState
            icon={<Inbox size={24} />}
            title="Your passport is empty"
            action={<Button variant="secondary">Share my identifier</Button>}
          >
            Ask an institution you have repaid to issue a repayment record.
          </EmptyState>
        </div>
      </Panel>

      <Panel title="Stepper">
        <Stepper
          steps={[
            { label: 'Draft the check', who: 'Verifier', state: 'done' },
            { label: 'Send response key', who: 'You', state: 'done' },
            { label: 'Commit terms', who: 'Verifier', state: 'waiting' },
            { label: 'Review and prove', who: 'You', state: 'upcoming' },
            { label: 'Read the result', who: 'Verifier', state: 'upcoming' },
          ]}
        />
      </Panel>

      <Panel title="Transaction progress">
        <div style={{ display: 'grid', gap: 16 }}>
          {TX_SAMPLES.map((t) => (
            <TxProgress
              key={t.label}
              status={t.status}
              title="Proving your repayment record"
              expectedSeconds={100}
              successTitle="Proof accepted"
              successBody="The verifier can now read the result."
              onRetry={() => undefined}
              onDismiss={() => undefined}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Credentials">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          <CredentialCard institution="Institution A" onTime={8n} total={8n} from={660n} to={671n} live>
            <TechDetails>
              <TechRow label="Leaf index" value="0" copy={false} />
              <TechRow label="Issuer key" value={HEX} />
            </TechDetails>
          </CredentialCard>
          <CredentialCard institution="Institution B" onTime={6n} total={7n} from={660n} to={671n} live selected />
          <CredentialCard institution="Institution C" onTime={11n} total={12n} from={648n} to={659n} live={false} />
          <CredentialCard institution="Institution A" onTime={8n} total={8n} from={660n} to={671n} live size="mini" />
        </div>
      </Panel>

      <Panel title="Privacy split">
        <PrivacySplit
          sees={[
            { label: 'You cleared the bar: at least 14 on time' },
            { label: 'The reporting window: Oct 2024 – Sep 2026' },
            { label: 'A one-time code that stops this proof being reused' },
          ]}
          keeps={[
            { label: 'Your exact total', value: '14' },
            { label: 'Which institutions', value: 'Institution A, Institution B' },
            { label: 'How many records', value: '2' },
            { label: 'Your identity key' },
          ]}
          keepsNote="Only your own proof server sees these, to build the proof."
        />
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        <Receipt
          status="cleared"
          threshold={14n}
          from={657n}
          to={680n}
          network="preview"
          notTold={['The exact number of repayments', 'Which institutions contributed', 'How many records were used']}
        >
          <TechDetails tone="paper">
            <TechRow label="Check ID" value={HEX} />
            <TechRow label="One-time code" note="nullifier" value={HEX} />
          </TechDetails>
        </Receipt>
        <Receipt status="awaiting" threshold={14n} from={657n} to={680n} network="preview" />
      </div>

      <Panel title="Dialog">
        <Button variant="danger" onClick={() => setDialog(true)}>
          Open confirm dialog
        </Button>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          tone="danger"
          icon={<Trash2 size={20} />}
          title="Revoke this record?"
          description="The borrower will no longer be able to use it in a proof. Checks it already answered stay answered."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setDialog(false)}>
                Revoke record
              </Button>
            </>
          }
        />
      </Panel>
    </div>
  );
};

export default Gallery;
