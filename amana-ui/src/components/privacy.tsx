// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The components that make privacy visible: what a verifier learns beside
 * what stays with the borrower, the credential card, and the receipt.
 */

import React from 'react';
import { BadgeCheck, Eye, Hourglass, LockKeyhole } from 'lucide-react';

import { StatusPill } from './surfaces.jsx';
import './privacy.css';

// --- brand -----------------------------------------------------------------

/** The Amana mark, traced from docs/assets/amana-mark.png. */
export const BrandMark: React.FC<{ size?: number; className?: string; title?: string }> = ({
  size = 28,
  className,
  title,
}) => (
  <svg
    className={className}
    width={size}
    height={size * (690 / 800)}
    viewBox="288 226 800 690"
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    fill="currentColor"
  >
    <path d="M295 908 L645 262 Q660 238 692 236 L796 233 L796 362 Q794 376 784 387 L657 515 Q625 550 625 600 L625 805 L573 898 Q567 908 556 908 Z" />
    <path d="M750 908 L750 632 Q750 600 722 586 Q694 574 667 590 Q672 560 690 543 L772 462 Q782 452 800 452 L826 452 Q846 452 856 472 L1078 908 Z" />
  </svg>
);

// --- privacy split ---------------------------------------------------------

export type DisclosureItem = {
  readonly label: React.ReactNode;
  /** The concrete value, when the borrower is looking at their own data. */
  readonly value?: React.ReactNode;
};

/**
 * Two columns: what the other party learns, and what never leaves the
 * borrower. This is the product's core idea, so it appears wherever a proof
 * happens, stated outright rather than implied.
 */
export const PrivacySplit: React.FC<{
  sees: readonly DisclosureItem[];
  keeps: readonly DisclosureItem[];
  seesTitle?: string;
  keepsTitle?: string;
  seesNote?: React.ReactNode;
  keepsNote?: React.ReactNode;
}> = ({
  sees,
  keeps,
  seesTitle = 'What the verifier learns',
  keepsTitle = 'What stays with you',
  seesNote,
  keepsNote,
}) => (
  <div className="privacy-split">
    <section className="privacy-col privacy-sees" aria-label={seesTitle}>
      <h3 className="privacy-col-title">
        <span className="privacy-col-icon" aria-hidden>
          <Eye size={16} />
        </span>
        {seesTitle}
      </h3>
      <ul className="privacy-list">
        {sees.map((item, i) => (
          <li key={i}>
            <span className="privacy-item-label">{item.label}</span>
            {item.value !== undefined && <span className="privacy-item-value">{item.value}</span>}
          </li>
        ))}
      </ul>
      {seesNote && <p className="privacy-note">{seesNote}</p>}
    </section>
    <section className="privacy-col privacy-keeps" aria-label={keepsTitle}>
      <h3 className="privacy-col-title">
        <span className="privacy-col-icon" aria-hidden>
          <LockKeyhole size={16} />
        </span>
        {keepsTitle}
      </h3>
      <ul className="privacy-list">
        {keeps.map((item, i) => (
          <li key={i}>
            <span className="privacy-item-label">{item.label}</span>
            {item.value !== undefined && <span className="privacy-item-value">{item.value}</span>}
          </li>
        ))}
      </ul>
      {keepsNote && <p className="privacy-note">{keepsNote}</p>}
    </section>
  </div>
);

// --- credential card -------------------------------------------------------

const fmtPeriod = (period: bigint): string => {
  const n = Number(period);
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][n % 12] + ' ' + (1970 + Math.floor(n / 12));
};

/**
 * One repayment record, as a card in the borrower's wallet.
 *
 * The face carries only what a person reads: who issued it, the count, the
 * months it covers, and whether it can still be used. Keys and leaf indexes
 * go in the technical details below the card, never on its face.
 */
export const CredentialCard: React.FC<{
  institution: string;
  onTime: bigint;
  total: bigint;
  from: bigint;
  to: bigint;
  live: boolean;
  /** Highlighted as one of the records a proof will use. */
  selected?: boolean;
  size?: 'full' | 'mini';
  /** False for a preview of a card someone else will hold. */
  held?: boolean;
  children?: React.ReactNode;
}> = ({ institution, onTime, total, from, to, live, selected = false, size = 'full', held = true, children }) => {
  const ratio = total === 0n ? 0 : Number((onTime * 1000n) / total) / 10;
  return (
    <article
      className={`credential credential-${size}${live ? '' : ' is-revoked'}${selected ? ' is-selected' : ''}`}
      aria-label={`${institution}: ${onTime} of ${total} repayments on time, ${fmtPeriod(from)} to ${fmtPeriod(to)}, ${live ? 'live' : 'revoked'}`}
    >
      <div className="credential-face">
        <div className="credential-guilloche" aria-hidden />
        <BrandMark className="credential-watermark" size={size === 'mini' ? 90 : 150} />
        <header className="credential-head">
          <div className="credential-issuer">
            <span className="credential-kind">Repayment record</span>
            <span className="credential-name">{institution}</span>
          </div>
          {live ? (
            <StatusPill tone="live">Live</StatusPill>
          ) : (
            <StatusPill tone="revoked">Revoked</StatusPill>
          )}
        </header>
        <div className="credential-figure">
          <span className="credential-count num">{onTime.toString()}</span>
          <span className="credential-of num">
            of {total.toString()} on time
          </span>
        </div>
        <div className="credential-meter" aria-hidden>
          <span style={{ width: `${Math.max(2, Math.min(100, ratio))}%` }} />
        </div>
        <footer className="credential-foot">
          <span className="credential-period num">
            {fmtPeriod(from)} – {fmtPeriod(to)}
          </span>
          {held && (
            <span className="credential-held">
              <LockKeyhole size={12} aria-hidden /> Held on this device
            </span>
          )}
        </footer>
        {!live && (
          <p className="credential-revoked-note">
            The issuer withdrew this record. It can no longer be used in a proof.
          </p>
        )}
      </div>
      {children && <div className="credential-extra">{children}</div>}
    </article>
  );
};

// --- receipt ---------------------------------------------------------------

/**
 * A verifier's result, as a slip of paper a credit officer could file.
 *
 * It states the bar and the window and nothing else, because nothing else
 * was proved: not the margin, not the institutions, not how many records.
 */
export const Receipt: React.FC<{
  status: 'cleared' | 'awaiting';
  threshold: bigint;
  from: bigint;
  to: bigint;
  network: string;
  /** What the result does not tell the reader. */
  notTold?: readonly string[];
  children?: React.ReactNode;
}> = ({ status, threshold, from, to, network, notTold, children }) => (
  <article className={`receipt receipt-${status}`} aria-label="Credit check result">
    <header className="receipt-head">
      <span className="receipt-brand">
        <BrandMark size={18} />
        <span>Amana</span>
      </span>
      <span className="receipt-doc">Credit check result</span>
    </header>

    <div className="receipt-stamp" aria-hidden>
      {status === 'cleared' ? <BadgeCheck size={20} /> : <Hourglass size={18} />}
      <span>{status === 'cleared' ? 'Cleared' : 'Awaiting proof'}</span>
    </div>

    <p className="receipt-statement">
      {status === 'cleared' ? 'The applicant has made ' : 'Has the applicant made '}
      <b className="num">at least {threshold.toString()}</b> on-time repayments between{' '}
      <b className="num">{fmtPeriod(from)}</b> and <b className="num">{fmtPeriod(to)}</b>
      {status === 'cleared' ? '.' : '?'}
    </p>

    <dl className="receipt-rows">
      <div>
        <dt>Required</dt>
        <dd className="num">{threshold.toString()} on-time repayments</dd>
      </div>
      <div>
        <dt>Reporting window</dt>
        <dd className="num">
          {fmtPeriod(from)} – {fmtPeriod(to)}
        </dd>
      </div>
      <div>
        <dt>Evidence</dt>
        <dd>{status === 'cleared' ? 'Zero-knowledge proof, accepted on chain' : 'Not yet submitted'}</dd>
      </div>
      <div>
        <dt>Network</dt>
        <dd>Midnight {network}</dd>
      </div>
    </dl>

    {notTold && notTold.length > 0 && (
      <div className="receipt-not">
        <p className="receipt-not-title">This result does not reveal</p>
        <ul>
          {notTold.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    )}

    {children && <div className="receipt-extra">{children}</div>}
  </article>
);
