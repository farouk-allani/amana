// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Everything that needs the Midnight runtime, behind one dynamic import.
 *
 * The SDK brings about 14 MB of WebAssembly and JavaScript. Loading it
 * statically left the page blank until all of it had arrived; importing it
 * from here lets the first screen paint at once while this loads behind it.
 *
 * @module
 */

export { AmanaAPI } from '../../api/src/index.js';
export { initialiseProviders } from './providers.js';
