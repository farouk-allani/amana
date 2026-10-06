// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * `npm run evidence:wallet` — create or restore the run's test wallet, print
 * the address to fund, then wait until it holds tNIGHT registered for DUST
 * generation and some DUST has accrued. Safe to stop and re-run.
 */

import { fileURLToPath } from 'node:url';
import { networks, loadOrCreateSeed, buildWallet, ensureFunded, saveWallet, log } from './wallet.mjs';

const network = networks[process.argv[2] ?? 'preview'];
const dir = fileURLToPath(new URL(`../../.evidence/${network.networkId}/`, import.meta.url));
const ctx = await buildWallet(network, loadOrCreateSeed(`${dir}wallet-seed`), `${dir}wallet-state.json`);

console.log(`\n  Test wallet (unshielded) on ${network.networkId}:\n\n    ${ctx.address}\n`);
console.log(`  Fund it at ${network.faucet}\n`);

log('Syncing with the network…');
await ensureFunded(ctx);
await saveWallet(ctx);
await ctx.wallet.stop();
process.exit(0);
