// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** The frame around the role screens: sidebar, top bar and phone tab bar. */

import React from 'react';
import { IdCard, Landmark, LockKeyhole, Scale, ShieldCheck, type LucideIcon } from 'lucide-react';

import { CopyButton, StatusPill, shortHex } from '../components/index.js';
import amanaLockup from '../../../docs/assets/amana-lockup-light.png';
import './shell.css';

export type Role = 'borrower' | 'verifier' | 'issuer' | 'registry';

export const ROLES: readonly { id: Role; label: string; short: string; job: string; icon: LucideIcon }[] = [
  { id: 'borrower', label: 'Borrower', short: 'Passport', job: 'Hold records, answer checks', icon: IdCard },
  { id: 'verifier', label: 'Verifying institution', short: 'Verify', job: 'Ask a question, read the answer', icon: ShieldCheck },
  { id: 'issuer', label: 'Issuing institution', short: 'Issue', job: 'Issue and revoke records', icon: Landmark },
  { id: 'registry', label: 'Registry operator', short: 'Registry', job: 'Admit institutions', icon: Scale },
];

export const isRole = (value: string): value is Role => ROLES.some((r) => r.id === value);

export const Lockup: React.FC<{ height?: number }> = ({ height = 30 }) => (
  <img className="lockup" src={amanaLockup} alt="Amana" height={height} style={{ height }} />
);

const NetworkPill: React.FC<{ networkId: string; sample: boolean }> = ({ networkId, sample }) =>
  sample ? (
    <StatusPill tone="pending">
      <span className="hide-sm">Sample data, not on chain</span>
      <span className="show-sm">Sample data</span>
    </StatusPill>
  ) : (
    <StatusPill tone="live" pulse>
      <span className="hide-sm">Midnight </span>
      {networkId}
    </StatusPill>
  );

export const Shell: React.FC<{
  role: Role;
  onRole: (role: Role) => void;
  networkId: string;
  registry: string;
  sample: boolean;
  /** Extra items for the sidebar foot, such as the private-data status. */
  deviceStatus?: React.ReactNode;
  children: React.ReactNode;
}> = ({ role, onRole, networkId, registry, sample, deviceStatus, children }) => (
  <div className="app">
    <a className="skip-link" href="#main">
      Skip to content
    </a>

    <aside className="sidebar">
      <div className="sidebar-brand">
        <Lockup height={30} />
      </div>
      <nav className="sidebar-nav" aria-label="Act as">
        <p className="sidebar-heading">Act as</p>
        <ul>
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = r.id === role;
            return (
              <li key={r.id}>
                <a
                  href={`#${r.id}`}
                  className={`role-link${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onRole(r.id);
                  }}
                >
                  <span className="role-icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span className="role-text">
                    <span className="role-label">{r.label}</span>
                    <span className="role-job">{r.job}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="sidebar-foot">
        {deviceStatus ?? (
          <div className="device-status">
            <LockKeyhole size={15} aria-hidden />
            <span>Your private data stays in this browser.</span>
          </div>
        )}
      </div>
    </aside>

    <div className="main-col">
      <header className="topbar">
        <div className="topbar-brand">
          <Lockup height={24} />
        </div>
        <div className="topbar-meta">
          <NetworkPill networkId={networkId} sample={sample} />
          <div className="registry-chip" title={registry}>
            <span className="registry-chip-label">Registry</span>
            <code className="registry-chip-value">{shortHex(registry, 6, 4)}</code>
            <CopyButton compact value={registry} label="Copy registry address" />
          </div>
        </div>
      </header>

      <main id="main" className="content" tabIndex={-1}>
        {children}
      </main>

      <footer className="app-foot">
        <span>Amana · Apache-2.0 · built on Midnight for the Midnight Buildathon</span>
        <a href="https://github.com/farouk-allani/amana" target="_blank" rel="noreferrer">
          Source and documentation
        </a>
      </footer>
    </div>

    <nav className="tabbar" aria-label="Act as">
      {ROLES.map((r) => {
        const Icon = r.icon;
        const active = r.id === role;
        return (
          <a
            key={r.id}
            href={`#${r.id}`}
            className={`tab${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={r.label}
            onClick={(e) => {
              e.preventDefault();
              onRole(r.id);
            }}
          >
            <Icon size={20} aria-hidden />
            <span>{r.short}</span>
          </a>
        );
      })}
    </nav>
  </div>
);
