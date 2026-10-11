// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * What the role screens need from Amana, and the context they run in.
 *
 * Screens depend on this slice of `AmanaAPI` rather than the class itself, so
 * a development build can substitute a sample registry to preview them
 * without a wallet or a proof server.
 *
 * @module
 */

import { createContext, useContext } from 'react';
import type { AmanaAPI } from '../../api/src/index.js';

export type AmanaClient = Pick<
  AmanaAPI,
  | 'deployedContractAddress'
  | 'state$'
  | 'subjectIdFor'
  | 'claimAuthority'
  | 'registerLender'
  | 'removeLender'
  | 'revokeOrphanedAttestation'
  | 'proposeAuthority'
  | 'acceptAuthority'
  | 'issueAttestation'
  | 'revokeAttestation'
  | 'importCredential'
  | 'draftCheck'
  | 'checkRecipientFor'
  | 'createCheck'
  | 'proveCreditStanding'
  | 'readCheck'
>;

export type AppContextValue = {
  readonly networkId: string;
  /** True when the screens show the development sample registry. */
  readonly sample: boolean;
};

export const AppContext = createContext<AppContextValue>({ networkId: 'preview', sample: false });

export const useAppContext = (): AppContextValue => useContext(AppContext);

/** Typical durations, from runs on preview with a laptop proof server. */
export const EXPECTED_SECONDS = { proof: 100, transaction: 25 } as const;
