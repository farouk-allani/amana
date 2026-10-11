// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Finding an injected Midnight wallet.
 *
 * Kept apart from the provider set so the first screen can ask "is a wallet
 * here?" without loading the Midnight SDK and its WebAssembly.
 *
 * @module
 */

import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import semver from 'semver';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

/** The first installed wallet whose connector API we can actually speak to. */
export const findWallet = (): InitialAPI | undefined => {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies((wallet as InitialAPI).apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
};

/** Whether a wallet this app can talk to has injected itself yet. */
export const hasCompatibleWallet = (): boolean => findWallet() !== undefined;
