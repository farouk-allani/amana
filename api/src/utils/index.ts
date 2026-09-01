// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Small helpers shared by the Amana front ends.
 *
 * @module
 */

/** Cryptographically random bytes, for nonces and check identifiers. */
export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

/** A fresh check identifier for a verifier to hand a borrower. */
export const newCheckId = (): string => bytesToHex(randomBytes(32));

export const bytesToHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Amana: hex string has odd length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

/**
 * The current period index: whole months since 1970-01.
 *
 * Attestations record *when* a borrower last repaid, at month granularity.
 * Months rather than days because a day-precise timestamp on a credit record
 * is a needlessly sharp correlation handle, and no lending decision turns on
 * it.
 */
export const currentPeriod = (now: Date = new Date()): bigint =>
  BigInt((now.getUTCFullYear() - 1970) * 12 + now.getUTCMonth());

/** The period index `months` ago, for building a recency window. */
export const periodsAgo = (months: number, now: Date = new Date()): bigint =>
  currentPeriod(now) - BigInt(months);

/**
 * A credential: what a lender hands a borrower after issuing.
 *
 * This blob is the entire credential. It is not a pointer to a record held on
 * a server somewhere — it *is* the record, and once the borrower has it, the
 * issuing lender has no further say over who sees it. That is the whole point
 * of the design, and it is why the transport is deliberately unspecified:
 * paste it, scan it, email it, print it.
 */
export type Credential = {
  readonly v: 1;
  readonly lenderName: string;
  readonly leafIndex: string;
  readonly attestation: {
    lender: string;
    subject: string;
    onTime: string;
    total: string;
    period: string;
    nonce: string;
  };
};

type AttestationLike = {
  lender: Uint8Array;
  subject: Uint8Array;
  onTime: bigint;
  total: bigint;
  period: bigint;
  nonce: Uint8Array;
};

export const encodeCredential = (
  attestation: AttestationLike,
  leafIndex: bigint,
  lenderName: string,
): string => {
  const credential: Credential = {
    v: 1,
    lenderName,
    leafIndex: leafIndex.toString(),
    attestation: {
      lender: bytesToHex(attestation.lender),
      subject: bytesToHex(attestation.subject),
      onTime: attestation.onTime.toString(),
      total: attestation.total.toString(),
      period: attestation.period.toString(),
      nonce: bytesToHex(attestation.nonce),
    },
  };
  return JSON.stringify(credential, null, 2);
};

export const decodeCredential = (
  text: string,
): { attestation: AttestationLike; leafIndex: bigint; lenderName: string } => {
  let parsed: Credential;
  try {
    parsed = JSON.parse(text) as Credential;
  } catch {
    throw new Error('That does not look like a credential — expected the JSON your lender gave you.');
  }
  if (parsed?.v !== 1 || !parsed.attestation) {
    throw new Error('Unrecognised credential format.');
  }
  const a = parsed.attestation;
  return {
    lenderName: parsed.lenderName ?? 'Unnamed institution',
    leafIndex: BigInt(parsed.leafIndex),
    attestation: {
      lender: hexToBytes(a.lender),
      subject: hexToBytes(a.subject),
      onTime: BigInt(a.onTime),
      total: BigInt(a.total),
      period: BigInt(a.period),
      nonce: hexToBytes(a.nonce),
    },
  };
};

/** Render a period index as a human-readable month. */
export const formatPeriod = (period: bigint): string => {
  const total = Number(period);
  const year = 1970 + Math.floor(total / 12);
  const month = total % 12;
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month]} ${year}`;
};
