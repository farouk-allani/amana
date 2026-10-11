// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The registry operator: decide which institutions may issue, void the
 * records of one withdrawn, and hand the registry on.
 */

import React, { useState } from 'react';
import {
  Ban,
  Building2,
  CircleCheck,
  FileX2,
  KeyRound,
  Landmark,
  Plus,
  Power,
  Scale,
  ShieldCheck,
  Undo2,
  UserPlus,
} from 'lucide-react';

import type { AmanaDerivedState } from '../../../../api/src/index.js';
import { utils } from '../../../../api/src/index.js';
import { EXPECTED_SECONDS, type AmanaClient } from '../../client.js';
import {
  Alert,
  Button,
  CopyButton,
  EmptyState,
  Field,
  Input,
  Metric,
  PageHeader,
  Panel,
  PrivacySplit,
  StatusPill,
  TechDetails,
  TechRow,
  TxDialog,
  TxProgress,
  shortHex,
} from '../../components/index.js';
import { useTransaction } from '../../transactions.js';
import './registry.css';

type Pending =
  | { kind: 'admit' }
  | { kind: 'withdraw'; key: string }
  | { kind: 'void'; leaf: bigint; issuer: string }
  | { kind: 'handover' };

const KeyInput: React.FC<{
  label: string;
  hint: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, hint, value, onChange }) => (
  <Field
    label={label}
    hint={hint}
    error={value.trim() && !utils.isHex32(value.trim()) ? 'That is not a 64-character key.' : undefined}
  >
    <Input
      mono
      value={value}
      spellCheck={false}
      autoComplete="off"
      placeholder="64 hexadecimal characters"
      onChange={(e) => onChange(e.target.value)}
    />
  </Field>
);

export const RegistryView: React.FC<{ api: AmanaClient; state: AmanaDerivedState }> = ({ api, state }) => {
  const { registry, identity } = state;
  const [pending, setPending] = useState<Pending | null>(null);
  const [key, setKey] = useState('');
  const claim = useTransaction();
  const accept = useTransaction();

  const close = () => {
    setPending(null);
    setKey('');
  };
  const operator = identity.isAuthority && registry.bootstrapped;
  const label = (k: string) => (k === identity.lenderKey ? 'This device' : 'Institution');

  return (
    <div className="role-screen registry">
      <PageHeader
        eyebrow="Registry operator"
        title="Registry"
        lede="Decide which institutions may issue records. The registry holds fingerprints and counters, never a borrower’s data."
      />

      <div className="metrics">
        <Metric label="Institutions" value={registry.lenders.length} icon={<Landmark size={16} />} sub="admitted to issue" />
        <Metric label="Records issued" value={registry.attestationsIssued.toString()} icon={<Building2 size={16} />} sub="since deployment" />
        <Metric label="Revoked or voided" value={registry.attestationsRevoked.toString()} icon={<Ban size={16} />} sub="no longer provable" />
        <Metric label="Checks answered" value={registry.checksAnswered.toString()} icon={<ShieldCheck size={16} />} sub="proofs accepted" />
      </div>

      {!registry.bootstrapped ? (
        <Panel
          tone="raised"
          icon={<Power size={18} />}
          title="Activate the registry"
          description="It has no operator yet. Only the key it was deployed with can claim it, once. The operator, an association or a regulator, then decides which institutions may issue."
        >
          {identity.isAuthority ? (
            claim.status.phase === 'idle' ? (
              <Button icon={<Power size={16} aria-hidden />} onClick={() => void claim.run(() => api.claimAuthority())}>
                Activate as operator
              </Button>
            ) : (
              <TxProgress
                status={claim.status}
                title="Activating the registry"
                expectedSeconds={EXPECTED_SECONDS.transaction}
                successTitle="You are the registry operator"
                onRetry={() => void claim.run(() => api.claimAuthority())}
                onDismiss={claim.reset}
              />
            )
          ) : (
            <Alert tone="info" title="This device cannot activate it">
              It was deployed from a different key. Open Amana on the device that deployed it.
            </Alert>
          )}
        </Panel>
      ) : (
        <section className={`authority${identity.isAuthority ? ' is-mine' : ''}`} aria-labelledby="authority-title">
          <span className="authority-icon" aria-hidden>
            <Scale size={22} />
          </span>
          <div className="authority-main">
            <h2 id="authority-title">
              {identity.isAuthority ? 'This device operates the registry' : 'Another key operates the registry'}
            </h2>
            <p>
              {registry.pendingAuthority
                ? identity.isPendingAuthority
                  ? 'The operator has offered the registry to this device. Nothing changes until you accept.'
                  : `Offered to ${shortHex(registry.pendingAuthority, 6, 4)}. Nothing changes until that key accepts, from its own device.`
                : 'Only the operator can admit or withdraw institutions. A handover takes two steps: offer, then accept.'}
            </p>
          </div>
          <div className="authority-actions">
            {identity.isAuthority && (
              <Button variant="secondary" size="sm" icon={<KeyRound size={15} aria-hidden />} onClick={() => setPending({ kind: 'handover' })}>
                Hand over…
              </Button>
            )}
            {identity.isPendingAuthority && accept.status.phase === 'idle' && (
              <Button size="sm" icon={<CircleCheck size={15} aria-hidden />} onClick={() => void accept.run(() => api.acceptAuthority())}>
                Accept the registry
              </Button>
            )}
          </div>
          {accept.status.phase !== 'idle' && (
            <div className="authority-progress">
              <TxProgress
                status={accept.status}
                title="Accepting the registry"
                expectedSeconds={EXPECTED_SECONDS.transaction}
                successTitle="This device now operates the registry"
                onDismiss={accept.reset}
              />
            </div>
          )}
        </section>
      )}

      <Panel
        icon={<Landmark size={18} />}
        title="Admitted institutions"
        description="Only these may issue records. Admission is the trust the whole scheme rests on: a proof shows a record is authentic and live, not that the repayments happened."
        actions={
          operator ? (
            <Button size="sm" icon={<UserPlus size={15} aria-hidden />} onClick={() => setPending({ kind: 'admit' })}>
              Admit
            </Button>
          ) : undefined
        }
      >
        {registry.lenders.length === 0 ? (
          <EmptyState
            icon={<Landmark size={24} />}
            title="No institutions admitted yet"
            action={
              operator ? (
                <Button icon={<Plus size={16} aria-hidden />} onClick={() => setPending({ kind: 'admit' })}>
                  Admit an institution
                </Button>
              ) : undefined
            }
          >
            An institution sends you the key shown on its own Amana screen. Admit it, and it can issue records.
          </EmptyState>
        ) : (
          <ul className="inst-list">
            {registry.lenders.map((k) => (
              <li key={k}>
                <span className="inst-icon" aria-hidden>
                  <Landmark size={17} />
                </span>
                <div className="inst-main">
                  <span className="inst-name">{label(k)}</span>
                  <code className="inst-key" title={k}>
                    {shortHex(k, 10, 8)}
                  </code>
                </div>
                <div className="inst-tags">
                  {k === registry.authority && <StatusPill tone="gold">Operator</StatusPill>}
                  <StatusPill tone="live">Can issue</StatusPill>
                </div>
                <div className="inst-actions">
                  <CopyButton compact value={k} label="Copy institution key" />
                  {operator && (
                    <Button variant="danger" size="sm" onClick={() => setPending({ kind: 'withdraw', key: k })}>
                      Withdraw
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {registry.orphanedLeaves.length > 0 && (
        <Panel
          icon={<FileX2 size={18} />}
          title="Records of withdrawn institutions"
          description="These still prove until they are voided. A proof cannot check its issuers’ standing without revealing who they are, so voiding is a public step, one record at a time."
        >
          <ul className="inst-list">
            {registry.orphanedLeaves.map((leaf) => {
              const issuer = registry.issuers.get(leaf) ?? '';
              return (
                <li key={leaf.toString()} className="is-orphan">
                  <span className="leaf-badge num" aria-hidden>
                    #{leaf.toString()}
                  </span>
                  <div className="inst-main">
                    <span className="inst-name">Record #{leaf.toString()}</span>
                    <span className="inst-key">Issued by withdrawn institution {shortHex(issuer, 6, 4)}</span>
                  </div>
                  <div className="inst-tags">
                    <StatusPill tone="pending">Awaiting voiding</StatusPill>
                  </div>
                  <div className="inst-actions">
                    {operator && (
                      <Button variant="danger" size="sm" onClick={() => setPending({ kind: 'void', leaf, issuer })}>
                        Void
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel
        title="What the registry can see"
        description="This split is how the contract is built, not a policy. The right-hand column never reaches the ledger in any form."
      >
        <PrivacySplit
          seesTitle="Public, on the ledger"
          keepsTitle="Never on the ledger"
          sees={[
            { label: 'Which institutions may issue' },
            { label: 'One fingerprint per record, and which institution issued it' },
            { label: 'Each check’s terms, and whether it was answered' },
            { label: 'One-time codes that stop answers being reused' },
            { label: 'Counts: issued, revoked, answered' },
          ]}
          keeps={[
            { label: 'Who any borrower is' },
            { label: 'Repayment counts and months' },
            { label: 'Which institutions a borrower has dealt with' },
            { label: 'That two records belong to the same person' },
            { label: 'The exact total behind any answer' },
          ]}
        />
      </Panel>

      <TechDetails>
        <TechRow label="Registry address" value={api.deployedContractAddress} />
        <TechRow label="Operator key" note="authority" value={registry.authority} />
        {registry.pendingAuthority && <TechRow label="Offered to" value={registry.pendingAuthority} />}
        <TechRow label="This device’s key" value={identity.lenderKey} />
        <TechRow label="Next free leaf" note="of 1,024" value={registry.nextLeaf.toString()} copy={false} />
      </TechDetails>

      <TxDialog
        open={pending?.kind === 'admit'}
        onClose={close}
        icon={<UserPlus size={20} />}
        title="Admit an institution"
        description="Paste the key from the institution’s own Amana screen. Once admitted, it can issue records that borrowers can prove."
        confirmLabel="Admit institution"
        canConfirm={utils.isHex32(key.trim()) && !registry.lenders.includes(key.trim().toLowerCase())}
        run={() => api.registerLender(key.trim().toLowerCase())}
        progressTitle="Admitting the institution"
        expectedSeconds={EXPECTED_SECONDS.transaction}
        successTitle="Institution admitted"
        successBody="It can issue records now."
      >
        <KeyInput label="Institution key" hint="64 hexadecimal characters." value={key} onChange={setKey} />
        {registry.lenders.includes(key.trim().toLowerCase()) && (
          <p className="dialog-note">That institution is already admitted.</p>
        )}
      </TxDialog>

      <TxDialog
        open={pending?.kind === 'withdraw'}
        onClose={close}
        tone="danger"
        icon={<Ban size={20} />}
        title="Withdraw this institution?"
        description="It will no longer be able to issue or revoke. Records it already issued keep proving until you void them, one at a time, below."
        confirmLabel="Withdraw institution"
        run={() => api.removeLender(pending?.kind === 'withdraw' ? pending.key : '')}
        progressTitle="Withdrawing the institution"
        expectedSeconds={EXPECTED_SECONDS.transaction}
        successTitle="Institution withdrawn"
        successBody="Its live records are listed under records of withdrawn institutions."
      >
        {pending?.kind === 'withdraw' && <code className="dialog-key">{pending.key}</code>}
      </TxDialog>

      <TxDialog
        open={pending?.kind === 'void'}
        onClose={close}
        tone="danger"
        icon={<FileX2 size={20} />}
        title={`Void record #${pending?.kind === 'void' ? pending.leaf.toString() : ''}?`}
        description="Its issuer has been withdrawn. Once voided, no proof can use it. Checks it already helped answer stay answered."
        confirmLabel="Void record"
        run={() => api.revokeOrphanedAttestation(pending?.kind === 'void' ? pending.leaf : 0n)}
        progressTitle="Voiding the record"
        expectedSeconds={EXPECTED_SECONDS.transaction}
        successTitle="Record voided"
      />

      <TxDialog
        open={pending?.kind === 'handover'}
        onClose={close}
        icon={<Undo2 size={20} />}
        title="Hand over the registry"
        description="Offer it to another key. You stay the operator until that key accepts from its own device, so a mistyped key cannot strand the registry. A later offer replaces this one."
        confirmLabel="Offer the registry"
        canConfirm={utils.isHex32(key.trim()) && key.trim().toLowerCase() !== identity.lenderKey}
        run={() => api.proposeAuthority(key.trim().toLowerCase())}
        progressTitle="Recording the offer"
        expectedSeconds={EXPECTED_SECONDS.transaction}
        successTitle="Offer recorded"
        successBody="The new operator accepts it from their own device, on this screen."
      >
        <KeyInput
          label="The new operator’s key"
          hint="The key shown on their Amana screen."
          value={key}
          onChange={setKey}
        />
      </TxDialog>
    </div>
  );
};
