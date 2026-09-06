// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import type { Attestation } from '../../../contract/src/index.js';
export const randomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));
export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
export const isHex32 = (value: string): boolean => /^(?:0x)?[0-9a-fA-F]{64}$/.test(value);
export const hexToBytes = (hex: string): Uint8Array => {
  if (typeof hex !== 'string') throw new Error('Expected hexadecimal text.');
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(clean)) throw new Error('Invalid hexadecimal text.');
  return Uint8Array.from(clean.match(/../g) ?? [], (byte) => parseInt(byte, 16));
};
export const keyBytes = (value: string): Uint8Array => {
  if (!isHex32(value)) throw new Error('Expected a 32-byte hexadecimal key.');
  return hexToBytes(value);
};
export const uint = (value: unknown, bits: number, label = 'Value'): bigint => {
  if ((typeof value !== 'bigint' && typeof value !== 'string') || !/^\d+$/.test(String(value)))
    throw new Error(label + ' must be a non-negative whole number.');
  const n = BigInt(value);
  if (n >= 2n ** BigInt(bits)) throw new Error(label + ' is too large.');
  return n;
};
/** Safe for partially edited form fields; never throws during rendering. */
export const parseUint = (value: string, bits = 16): bigint | null => {
  try { return uint(value, bits); } catch { return null; }
};
export const currentPeriod = (now = new Date()): bigint =>
  BigInt((now.getUTCFullYear() - 1970) * 12 + now.getUTCMonth());
export const periodsAgo = (months: number, now = new Date()): bigint => currentPeriod(now) - BigInt(months);
export const formatPeriod = (period: bigint): string => {
  const n = Number(period);
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][n % 12]
    + ' ' + (1970 + Math.floor(n / 12));
};
export const validateAttestation = (a: Attestation): void => {
  for (const key of [a.lender, a.subject, a.nonce]) {
    if (!(key instanceof Uint8Array) || key.length !== 32) throw new Error('Invalid credential key.');
  }
  uint(a.onTime, 16, 'On-time count'); uint(a.total, 16, 'Total count');
  uint(a.periodStart, 32, 'Start month'); uint(a.periodEnd, 32, 'End month');
  if (a.onTime > a.total) throw new Error('On-time repayments cannot exceed total repayments.');
  if (a.periodStart > a.periodEnd) throw new Error('The reporting interval is reversed.');
};
export type Credential = {
  v: 2; contractAddress: string; lenderName: string; leafIndex: string;
  attestation: { lender: string; subject: string; onTime: string; total: string;
    periodStart: string; periodEnd: string; nonce: string };
};
export const encodeCredential = (a: Attestation, leafIndex: bigint, lenderName: string, contractAddress: string): string => {
  validateAttestation(a);
  const credential: Credential = {
    v: 2, contractAddress, lenderName, leafIndex: leafIndex.toString(),
    attestation: { lender: bytesToHex(a.lender), subject: bytesToHex(a.subject),
      onTime: a.onTime.toString(), total: a.total.toString(), periodStart: a.periodStart.toString(),
      periodEnd: a.periodEnd.toString(), nonce: bytesToHex(a.nonce) },
  };
  return JSON.stringify(credential, null, 2);
};
export const decodeCredential = (text: string): {
  contractAddress: string; attestation: Attestation; leafIndex: bigint; lenderName: string;
} => {
  let p: Credential;
  try { p = JSON.parse(text) as Credential; } catch { throw new Error('Expected the credential JSON supplied by your lender.'); }
  if (p?.v !== 2 || !p.attestation) throw new Error('Version 2 credential required. Older summaries need reissuance with a reporting interval.');
  if (typeof p.contractAddress !== 'string' || !isHex32(p.contractAddress)) throw new Error('Missing or invalid registry address.');
  if (typeof p.lenderName !== 'string' || p.lenderName.length > 160) throw new Error('Invalid institution label.');
  const a = p.attestation;
  const attestation: Attestation = {
    lender: keyBytes(a.lender), subject: keyBytes(a.subject), nonce: keyBytes(a.nonce),
    onTime: uint(a.onTime, 16), total: uint(a.total, 16),
    periodStart: uint(a.periodStart, 32), periodEnd: uint(a.periodEnd, 32),
  };
  validateAttestation(attestation);
  const leafIndex = uint(p.leafIndex, 10, 'Leaf index');
  return { contractAddress: p.contractAddress, attestation, leafIndex, lenderName: p.lenderName };
};
