// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Logger } from 'pino';

import { AmanaAPI, type AmanaDerivedState } from '../../api/src/index.js';
import { initialiseProviders } from './providers.js';
import { ActionButton, Card, Field, Notice, describe } from './ui.jsx';
import { RegistryView } from './views/Registry.jsx';
import { LenderView } from './views/Lender.jsx';
import { BorrowerView } from './views/Borrower.jsx';
import { VerifierView } from './views/Verifier.jsx';

const ADDRESS_MEMORY = 'amana:last-contract-address';

type Role = 'registry' | 'lender' | 'borrower' | 'verifier';

const ROLES: { id: Role; label: string; sub: string }[] = [
  { id: 'registry', label: 'Registry', sub: 'who may issue' },
  { id: 'lender', label: 'Lender', sub: 'issue & revoke' },
  { id: 'borrower', label: 'Borrower', sub: 'hold & prove' },
  { id: 'verifier', label: 'Verifier', sub: 'ask & read' },
];

type Session =
  | { k: 'disconnected' }
  | { k: 'connecting'; what: string }
  | { k: 'ready'; api: AmanaAPI }
  | { k: 'failed'; error: string };

export const App: React.FC<{ logger: Logger; networkId: string }> = ({ logger, networkId }) => {
  const [session, setSession] = useState<Session>({ k: 'disconnected' });
  const [state, setState] = useState<AmanaDerivedState | null>(null);
  const [role, setRole] = useState<Role>('registry');
  const [joinAddress, setJoinAddress] = useState(
    () => localStorage.getItem(ADDRESS_MEMORY) ?? '',
  );

  const api = session.k === 'ready' ? session.api : null;

  // Follow the contract's public state and this device's private state.
  useEffect(() => {
    if (!api) return;
    const sub = api.state$.subscribe({
      next: setState,
      error: (e: unknown) => logger.error({ stateError: describe(e) }),
    });
    return () => sub.unsubscribe();
  }, [api, logger]);

  const start = useCallback(
    async (mode: 'deploy' | 'join') => {
      setSession({ k: 'connecting', what: mode === 'deploy' ? 'Deploying a registry' : 'Joining' });
      try {
        const providers = await initialiseProviders(networkId, logger);
        const next =
          mode === 'deploy'
            ? await AmanaAPI.deploy(providers, logger)
            : await AmanaAPI.join(providers, joinAddress.trim(), logger);
        localStorage.setItem(ADDRESS_MEMORY, next.deployedContractAddress);
        setJoinAddress(next.deployedContractAddress);
        setSession({ k: 'ready', api: next });
      } catch (e) {
        setSession({ k: 'failed', error: describe(e) });
      }
    },
    [joinAddress, logger, networkId],
  );

  const body = useMemo(() => {
    if (!api || !state) return null;
    switch (role) {
      case 'registry':
        return <RegistryView api={api} state={state} />;
      case 'lender':
        return <LenderView api={api} state={state} />;
      case 'borrower':
        return <BorrowerView api={api} state={state} />;
      case 'verifier':
        return <VerifierView api={api} state={state} />;
    }
  }, [api, state, role]);

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <div className="wordmark">
            <h1>Amana</h1>
            <span className="arabic" aria-hidden="true">
              أمانة
            </span>
          </div>
          <p className="tagline">
            A repayment record you earned at one lender, proved to another — without revealing
            which lenders, how much, or that it was you.
          </p>
        </div>
        {api && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--paper-faint)', marginBottom: 4 }}>
              REGISTRY
            </div>
            <div className="hash" style={{ maxWidth: 260 }}>
              {api.deployedContractAddress}
            </div>
          </div>
        )}
      </header>

      {session.k === 'failed' && <Notice kind="error">{session.error}</Notice>}

      {!api ? (
        <Card
          title="Connect"
          lede={
            <>
              Amana needs the Midnight Lace wallet and a proof server. Proofs are built on your own
              machine — no server we run is ever given the data a proof is about.
            </>
          }
        >
          {session.k === 'connecting' && (
            <Notice kind="info">{session.what}. Approve the request in Lace…</Notice>
          )}
          <Field
            label="Existing registry address"
            hint="Leave blank and deploy a fresh registry if you are starting from scratch."
          >
            <input
              className="mono"
              value={joinAddress}
              placeholder="0200…"
              onChange={(e) => setJoinAddress(e.target.value)}
            />
          </Field>
          <div className="actions">
            <ActionButton
              label="Join registry"
              busyLabel="Joining…"
              disabled={joinAddress.trim().length === 0 || session.k === 'connecting'}
              onRun={() => start('join')}
            />
            <ActionButton
              label="Deploy a new registry"
              busyLabel="Deploying…"
              kind="ghost"
              disabled={session.k === 'connecting'}
              onRun={() => start('deploy')}
            />
          </div>
        </Card>
      ) : (
        <>
          <nav className="roles">
            {ROLES.map((r) => (
              <button
                key={r.id}
                className={role === r.id ? 'active' : ''}
                onClick={() => setRole(r.id)}
              >
                {r.label}
                <span className="role-sub">{r.sub}</span>
              </button>
            ))}
          </nav>
          {state ? body : <Notice kind="info">Reading the registry…</Notice>}
        </>
      )}

      <footer className="foot">
        <span>
          Amana — Midnight Buildathon, Wave 1. Apache-2.0. <code>{networkId}</code>
        </span>
        <span>
          Amounts, terms and lender identities never leave this device.
        </span>
      </footer>
    </div>
  );
};

export default App;
