// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { describe as describeError, explainError } from './errors.js';
import { ProofServerError } from './stage-reporting.js';

const connector = (code: string) =>
  Object.assign(new Error('connector said no'), { type: 'DAppConnectorAPIError', code, reason: 'x' });

describe('explainError', () => {
  it('turns a circuit assertion into the sentence we wrote in Compact', () => {
    const e = explainError(new Error('Error: failed assert: only the issuing lender may revoke'));
    expect(e.title).toBe('The contract refused this');
    expect(e.body).toBe('Only the issuing lender may revoke. Nothing was recorded on chain.');
    expect(e.raw).toContain('failed assert');
  });

  it('reads a declined wallet request from the connector code', () => {
    expect(explainError(connector('Rejected')).title).toBe('Cancelled in Lace');
    expect(explainError(connector('PermissionRejected')).title).toBe('Cancelled in Lace');
    expect(explainError(connector('Disconnected')).title).toBe('Lace disconnected');
  });

  it('tells an unreachable proof server from one that failed', () => {
    const down = explainError(new ProofServerError(new TypeError('Failed to fetch')));
    expect(down.title).toBe("Can't reach the proof server");
    expect(down.body).toContain('port 6300');

    const failed = explainError(
      new ProofServerError(new Error('Failed Proof Server response: url="http://localhost:6300/prove", code="502"')),
    );
    expect(failed.title).toBe('The proof server could not build the proof');
  });

  it('names a missing wallet, missing fees and a lost indexer', () => {
    expect(explainError(new Error('No compatible Midnight Lace wallet was found.')).title).toBe('Lace wallet not found');
    expect(explainError(new Error('Insufficient funds: not enough DUST')).title).toBe('Not enough DUST for the fee');
    expect(explainError(new Error('Indexer websocket closed')).title).toBe('Lost contact with the network');
    expect(explainError(new TypeError('Failed to fetch')).title).toBe('Lost contact with the network');
  });

  it('says a transaction the network rejected changed nothing', () => {
    class CallTxFailedError extends Error {}
    expect(explainError(new CallTxFailedError('status: FailFallible')).title).toBe(
      'The network rejected the transaction',
    );
    // As it arrives from a minified build: a renamed class, the same data.
    const minified = Object.assign(new Error('x'), { finalizedTxData: { status: 'FailFallible' } });
    expect(explainError(minified).title).toBe('The network rejected the transaction');
  });

  it('shows our own short API messages as they are', () => {
    const e = explainError(new Error('This credential belongs to a different borrower.'));
    expect(e.title).toBe('This credential belongs to a different borrower.');
    expect(e.body).toBe('');
  });

  it('falls back to a plain message and keeps the raw one', () => {
    const raw = 'TypeError: x is undefined\n    at foo (bar.js:1:2)\n'.repeat(5);
    const e = explainError(new Error(raw));
    expect(e.title).toBe('Something went wrong');
    expect(e.raw).toBe(raw);
  });

  it('accepts values that are not errors', () => {
    expect(explainError('Registry not found on the selected network.').title).toBe('No registry at that address');
    expect(explainError(undefined).raw).toBe('undefined');
  });
});

describe('describe', () => {
  it('capitalises an assertion and leaves other messages alone', () => {
    expect(describeError(new Error('failed assert: check already answered'))).toBe('Check already answered');
    expect(describeError(new Error('plain'))).toBe('plain');
  });
});
