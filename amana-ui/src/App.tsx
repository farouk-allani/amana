// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import type { Logger } from 'pino';
import { TriangleAlert } from 'lucide-react';

import { AmanaAPI, type AmanaDerivedState } from '../../api/src/index.js';
import { AppContext, type AmanaClient } from './client.js';
import { initialiseProviders } from './providers.js';
import { Spinner } from './components/index.js';
import { Connect } from './shell/Connect.jsx';
import { isRole, Shell, type Role } from './shell/Shell.jsx';
import { RegistryView } from './views/Registry.jsx';
import { LenderView } from './views/Lender.jsx';
import { BorrowerView } from './views/borrower/BorrowerView.jsx';
import { VerifierView } from './views/Verifier.jsx';

const ADDRESS_MEMORY = 'amana:last-contract-address';

type Session =
  | { k: 'disconnected'; error?: unknown }
  | { k: 'connecting'; mode: 'join' | 'deploy' }
  | { k: 'ready'; client: AmanaClient; sample: boolean };

const roleFromHash = (): Role => {
  const hash = window.location.hash.slice(1);
  return isRole(hash) ? hash : 'borrower';
};

const readMemory = (): string => {
  try {
    return localStorage.getItem(ADDRESS_MEMORY) ?? '';
  } catch {
    return '';
  }
};

/** Development only: whether to open straight into the sample registry. */
const wantsSample = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('sample');

export const App: React.FC<{ logger: Logger; networkId: string }> = ({ logger, networkId }) => {
  const [session, setSession] = useState<Session>({ k: 'disconnected' });
  const [state, setState] = useState<AmanaDerivedState | null>(null);
  const [role, setRole] = useState<Role>(roleFromHash);
  // Screens stay mounted once visited, so switching roles keeps a half-filled
  // form, or a proof in progress, exactly where it was.
  const [visited, setVisited] = useState<ReadonlySet<Role>>(() => new Set([roleFromHash()]));
  const [address, setAddress] = useState(readMemory);

  const client = session.k === 'ready' ? session.client : null;

  // Follow the contract's public state and this device's private state.
  useEffect(() => {
    if (!client) return;
    const sub = client.state$.subscribe({
      next: setState,
      error: (e: unknown) => {
        logger.error({ stateError: String(e) });
        setState(null);
        setSession({ k: 'disconnected', error: e });
      },
    });
    return () => sub.unsubscribe();
  }, [client, logger]);

  // Back and forward move between roles.
  useEffect(() => {
    const follow = () => {
      const next = roleFromHash();
      setRole(next);
      setVisited((v) => (v.has(next) ? v : new Set(v).add(next)));
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const chooseRole = useCallback((next: Role) => {
    if (window.location.hash !== `#${next}`) window.history.pushState(null, '', `#${next}`);
    setRole(next);
    setVisited((v) => (v.has(next) ? v : new Set(v).add(next)));
    window.scrollTo({ top: 0 });
    document.getElementById('main')?.focus({ preventScroll: true });
  }, []);

  const start = useCallback(
    async (mode: 'deploy' | 'join') => {
      setState(null);
      setSession({ k: 'connecting', mode });
      try {
        const providers = await initialiseProviders(networkId, logger);
        const api =
          mode === 'deploy'
            ? await AmanaAPI.deploy(providers, logger)
            : await AmanaAPI.join(providers, address.trim(), logger);
        try {
          localStorage.setItem(ADDRESS_MEMORY, api.deployedContractAddress);
        } catch {
          // Storage may be unavailable; the address is still shown and copyable.
        }
        setAddress(api.deployedContractAddress);
        setSession({ k: 'ready', client: api, sample: false });
      } catch (e) {
        logger.error({ connectError: String(e) });
        setSession({ k: 'disconnected', error: e });
      }
    },
    [address, logger, networkId],
  );

  const startSample = useCallback(() => {
    if (!import.meta.env.DEV) return;
    void import('./dev/sample-client.js').then(({ createSampleClient }) => {
      setState(null);
      setSession({ k: 'ready', client: createSampleClient(), sample: true });
    });
  }, []);

  useEffect(() => {
    if (wantsSample()) startSample();
  }, [startSample]);

  if (!client) {
    return (
      <Connect
        networkId={networkId}
        address={address}
        onAddress={setAddress}
        connecting={session.k === 'connecting' ? session.mode : null}
        error={session.k === 'disconnected' ? (session.error ?? null) : null}
        onDismissError={() => setSession({ k: 'disconnected' })}
        onJoin={() => void start('join')}
        onDeploy={() => void start('deploy')}
        onSample={import.meta.env.DEV ? startSample : undefined}
      />
    );
  }

  const sample = session.k === 'ready' && session.sample;

  const view = (r: Role) => {
    if (!state) return null;
    switch (r) {
      case 'borrower':
        return <BorrowerView api={client} state={state} />;
      case 'verifier':
        return <VerifierView api={client} state={state} />;
      case 'issuer':
        return <LenderView api={client} state={state} />;
      case 'registry':
        return <RegistryView api={client} state={state} />;
    }
  };

  return (
    <AppContext.Provider value={{ networkId, sample }}>
      <Shell
        role={role}
        onRole={chooseRole}
        networkId={networkId}
        registry={client.deployedContractAddress}
        sample={sample}
        deviceStatus={
          <div className="device-status">
            <TriangleAlert size={15} aria-hidden />
            <span>Your key and records are stored in this browser, not yet encrypted.</span>
          </div>
        }
      >
        {state ? (
          [...visited].map((r) => (
            <div key={r} hidden={r !== role}>
              {view(r)}
            </div>
          ))
        ) : (
          <div className="loading-screen" role="status">
            <Spinner size={22} />
            <p>Reading the registry from Midnight {networkId}…</p>
          </div>
        )}
      </Shell>
    </AppContext.Provider>
  );
};

export default App;
