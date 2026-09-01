// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The compiled Amana contract, bound to its witnesses.
 *
 * @packageDocumentation
 */

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import * as CompiledAmana from './managed/amana/contract/index.js';
import * as Witnesses from './witnesses.js';

export * from './managed/amana/contract/index.js';
export * from './witnesses.js';

/**
 * The Amana contract as the Midnight.js providers expect it: compiled
 * circuits, the witnesses that feed them private state, and the location of
 * the proving and verifying key material emitted by `compact compile`.
 */
export const AmanaCompiledContract = CompiledContract.make<
  CompiledAmana.Contract<Witnesses.AmanaPrivateState>
>('Amana', CompiledAmana.Contract<Witnesses.AmanaPrivateState>).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets('./managed/amana'),
);
