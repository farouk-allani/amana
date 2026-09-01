// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import type { AmanaAPI, AmanaDerivedState } from '../../../api/src/index.js';
import { ActionButton, Badge, Card, Field, Hash, Notice, Stat } from '../ui.jsx';

export const RegistryView: React.FC<{ api: AmanaAPI; state: AmanaDerivedState }> = ({
  api,
  state,
}) => {
  const [newLender, setNewLender] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const { registry, identity } = state;

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="The registry">
        <div className="stat-row">
          <Stat n={registry.lenders.length} l="Institutions" />
          <Stat n={registry.attestationsIssued.toString()} l="Issued" />
          <Stat n={registry.attestationsRevoked.toString()} l="Revoked" />
          <Stat n={registry.checksAnswered.toString()} l="Checks answered" />
        </div>
      </Card>

      <Card
        title="What the chain can see"
        lede="Amana's split is not a matter of policy or good behaviour. The right-hand column is data the contract is structurally incapable of reading — it exists only as a hash the circuit opens inside a proof."
      >
        <div className="split">
          <section className="public">
            <h3>Public ledger</h3>
            <ul>
              <li>Which institutions may issue</li>
              <li>One Merkle root over every attestation ever issued</li>
              <li>Spent nullifiers</li>
              <li>Which thresholds were cleared, and by nobody in particular</li>
              <li>Counts: issued, revoked, answered</li>
            </ul>
          </section>
          <section className="private">
            <h3>Never leaves the device</h3>
            <ul>
              <li>Loan amounts and terms</li>
              <li>How many repayments, and how many on time</li>
              <li>Which institutions a borrower has dealt with</li>
              <li>The borrower's identity key</li>
              <li>That any two records belong to the same person</li>
            </ul>
          </section>
        </div>
      </Card>

      {!registry.bootstrapped ? (
        <Card
          title="Claim the registry"
          lede="This registry has no authority yet. The first key to claim it becomes the operator — the consortium or regulator who decides which institutions may issue attestations. There is no second claim."
        >
          <ActionButton
            label="Claim as authority"
            busyLabel="Claiming…"
            onRun={() => api.claimAuthority()}
            onError={setError}
            onDone={setOk}
            doneMessage="You are now the registry authority."
          />
        </Card>
      ) : (
        <Card title="Authority">
          <div className="kv">
            <span className="k">Operator key</span>
            <span className="v">
              <Hash value={registry.authority} />
            </span>
          </div>
          <div className="kv">
            <span className="k">This device</span>
            <span className="v">
              {identity.isAuthority ? (
                <Badge kind="gold">is the authority</Badge>
              ) : (
                <Badge kind="neutral">is not the authority</Badge>
              )}
            </span>
          </div>
        </Card>
      )}

      {identity.isAuthority && (
        <Card
          title="Admit an institution"
          lede="Paste the lender key from the institution's own Lender tab. Only admitted institutions can issue attestations, and this is the trust root the whole scheme rests on."
        >
          <Field label="Lender key" hint="64 hex characters.">
            <input
              className="mono"
              value={newLender}
              placeholder="a3f1…"
              onChange={(e) => setNewLender(e.target.value)}
            />
          </Field>
          <ActionButton
            label="Register lender"
            busyLabel="Registering…"
            disabled={newLender.trim().length !== 64}
            onRun={async () => {
              await api.registerLender(newLender.trim());
              setNewLender('');
            }}
            onError={setError}
            onDone={setOk}
            doneMessage="Institution admitted."
          />
        </Card>
      )}

      <Card title="Admitted institutions">
        {registry.lenders.length === 0 ? (
          <div className="empty">No institutions admitted yet.</div>
        ) : (
          registry.lenders.map((key) => (
            <div className="record" key={key}>
              <div className="body">
                <div className="title">
                  <Hash value={key} />
                </div>
                <div className="meta">
                  {key === identity.lenderKey ? 'This device' : 'Permitted to issue'}
                </div>
              </div>
              {key === registry.authority && <Badge kind="gold">authority</Badge>}
            </div>
          ))
        )}
      </Card>
    </>
  );
};
