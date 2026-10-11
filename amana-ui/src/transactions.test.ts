// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { TX_STAGES, onStage, reportStage, type TxStage } from './transactions.js';

describe('the stage channel', () => {
  it('delivers reports to every subscriber until it unsubscribes', () => {
    const a: TxStage[] = [];
    const b: TxStage[] = [];
    const offA = onStage((s) => a.push(s));
    const offB = onStage((s) => b.push(s));
    reportStage('prove');
    offA();
    reportStage('approve');
    offB();
    reportStage('submit');
    expect(a).toEqual(['prove']);
    expect(b).toEqual(['prove', 'approve']);
  });

  it('lists the stages in the order the SDK crosses them', () => {
    expect(TX_STAGES).toEqual(['prepare', 'prove', 'approve', 'submit', 'confirm']);
  });
});
