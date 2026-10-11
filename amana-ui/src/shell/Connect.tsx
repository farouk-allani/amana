// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** The first screen: what Amana is, what it needs, and joining a registry. */

import React, { useEffect, useState } from 'react';
import { ArrowRight, CircleCheck, CircleDashed, Cpu, FlaskConical, IdCard, LockKeyhole, ShieldCheck, Wallet } from 'lucide-react';

import { Alert, Button, ErrorAlert, Field, Input } from '../components/index.js';
import { hasCompatibleWallet } from '../providers.js';
import { utils } from '../../../api/src/index.js';
import { Lockup } from './Shell.jsx';

/** The protocol 3 registry the scripted evidence run used on preview. */
export const PUBLIC_PREVIEW_REGISTRY = '663c23414094c13a26ca98f476923a1d8b32bd631b9a83e3a3ad2a91df7d1c1e';

const POINTS = [
  {
    icon: IdCard,
    title: 'Borrowers hold their own record',
    body: 'An institution you repaid issues a record to you. Only an opaque fingerprint of it goes on chain.',
  },
  {
    icon: ShieldCheck,
    title: 'Prove a statement, not the data',
    body: 'Answer a lender’s question with a zero-knowledge proof. They learn the bar was cleared, nothing more.',
  },
  {
    icon: LockKeyhole,
    title: 'Private by construction',
    body: 'Counts, dates and institutions stay with you and your own proof server. The ledger never receives them.',
  },
];

export const Connect: React.FC<{
  networkId: string;
  address: string;
  onAddress: (value: string) => void;
  connecting: 'join' | 'deploy' | null;
  error: unknown;
  onDismissError: () => void;
  onJoin: () => void;
  onDeploy: () => void;
  /** Development builds only. */
  onSample?: () => void;
}> = ({ networkId, address, onAddress, connecting, error, onDismissError, onJoin, onDeploy, onSample }) => {
  const [wallet, setWallet] = useState<'checking' | 'found' | 'missing'>('checking');

  // The extension injects itself after the page's scripts may have run.
  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const look = () => {
      if (stopped) return;
      if (hasCompatibleWallet()) return setWallet('found');
      if (Date.now() - started > 3000) return setWallet('missing');
      setTimeout(look, 250);
    };
    look();
    return () => {
      stopped = true;
    };
  }, []);

  const trimmed = address.trim();
  const addressError = trimmed && !utils.isHex32(trimmed) ? 'A registry address is 64 hexadecimal characters.' : undefined;

  return (
    <div className="connect">
      <a className="skip-link" href="#connect-main">
        Skip to content
      </a>
      <div className="connect-glow" aria-hidden />
      <header className="connect-top">
        <Lockup height={34} />
        <span className="connect-arabic" lang="ar" aria-hidden>
          أمانة
        </span>
      </header>

      <main id="connect-main" className="connect-grid">
        <section className="connect-pitch" aria-labelledby="pitch-title">
          <p className="page-eyebrow">Portable private repayment history</p>
          <h1 id="pitch-title" className="connect-title">
            A repayment record you earned at one lender, proved to another.
          </h1>
          <p className="connect-lede">Without revealing which lenders, how much, or that it was you.</p>
          <ul className="connect-points">
            {POINTS.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.title}>
                  <span className="connect-point-icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span>
                    <b>{p.title}</b>
                    <span>{p.body}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="connect-card" aria-labelledby="connect-title">
          <h2 id="connect-title" className="connect-card-title">
            Open a registry
          </h2>
          <p className="connect-card-lede">
            A registry is one Amana deployment on Midnight {networkId}. Join an existing one, or deploy your own to try
            all four roles.
          </p>

          <ul className="requirements" aria-label="What you need">
            <li className={`requirement is-${wallet}`}>
              <span className="requirement-icon" aria-hidden>
                {wallet === 'found' ? <CircleCheck size={18} /> : <Wallet size={18} />}
              </span>
              <span className="requirement-text">
                <b>Lace Midnight wallet</b>
                <span>
                  {wallet === 'checking'
                    ? 'Looking for the extension…'
                    : wallet === 'found'
                      ? `Found. Set it to the ${networkId} network.`
                      : 'Not found in this browser. Install Lace Midnight Preview and reload.'}
                </span>
              </span>
            </li>
            <li className="requirement">
              <span className="requirement-icon" aria-hidden>
                <Cpu size={18} />
              </span>
              <span className="requirement-text">
                <b>A proof server on this computer</b>
                <span>Running on port 6300 and selected in Lace. Proofs are built there, not by us.</span>
              </span>
            </li>
          </ul>

          {error !== null && error !== undefined && <ErrorAlert error={error} onDismiss={onDismissError} />}

          {connecting && (
            <Alert tone="info" title={connecting === 'deploy' ? 'Deploying a registry' : 'Joining the registry'}>
              Approve the request in Lace.{' '}
              {connecting === 'deploy' ? 'Deployment builds a proof and takes a minute or two.' : ''}
            </Alert>
          )}

          <Field
            label="Registry address"
            error={addressError}
            hint={
              <>
                Paste the address you were given, or{' '}
                <button type="button" className="link-button" onClick={() => onAddress(PUBLIC_PREVIEW_REGISTRY)}>
                  use the public preview registry
                </button>
                .
              </>
            }
          >
            <Input
              mono
              value={address}
              placeholder="64 hexadecimal characters"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => onAddress(e.target.value)}
            />
          </Field>

          <div className="connect-actions">
            <Button
              size="lg"
              block
              iconEnd={<ArrowRight size={18} aria-hidden />}
              loading={connecting === 'join'}
              disabled={!utils.isHex32(trimmed) || connecting !== null}
              onClick={onJoin}
            >
              Join registry
            </Button>
            <Button variant="secondary" block loading={connecting === 'deploy'} disabled={connecting !== null} onClick={onDeploy}>
              Deploy a new registry
            </Button>
          </div>

          {import.meta.env.DEV && onSample && (
            <div className="connect-sample">
              <span className="connect-sample-rule">
                <span>Development build</span>
              </span>
              <Button variant="ghost" block icon={<FlaskConical size={16} aria-hidden />} onClick={onSample}>
                Preview with sample data
              </Button>
              <p>Fictional institutions, held in memory. Nothing is sent to a network.</p>
            </div>
          )}
        </section>
      </main>

      <footer className="connect-foot">
        <span>
          <CircleDashed size={13} aria-hidden /> Your records go only to your own proof server. This site serves the
          app and its public proving keys, nothing else.
        </span>
        <a href="https://github.com/farouk-allani/amana" target="_blank" rel="noreferrer">
          Source and documentation
        </a>
      </footer>
    </div>
  );
};
