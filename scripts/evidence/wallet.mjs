// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
//
// Wallet construction, DUST registration and the midnight-js wallet bridge are
// adapted from midnightntwrk/example-counter (Apache-2.0), counter-cli/src/api.ts.

/**
 * A headless Midnight wallet for the scripted evidence run.
 *
 * One funded test wallet pays every fee in the run. The Amana participants
 * (operator, institutions, borrower, verifier) are separate private states,
 * not separate wallets, so fee payment links their transactions to each other
 * on the network. In real use each participant pays from its own wallet; see
 * docs/AUDIT.md, AUD-13.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import { WalletFacade, WalletEntrySchema, mergeWalletEntries } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { createKeystore, PublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

// The wallet SDK's GraphQL subscriptions expect the `ws` implementation.
globalThis.WebSocket = WebSocket;

export const networks = {
  preview: {
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    proofServer: process.env.AMANA_PROOF_SERVER ?? 'http://127.0.0.1:6300',
    faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
    explorer: 'https://preview.midnightexplorer.com',
  },
};

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
export { log };

/** The run's wallet seed: AMANA_EVIDENCE_SEED, else a gitignored file, else a fresh one saved there. */
export const loadOrCreateSeed = (file) => {
  if (process.env.AMANA_EVIDENCE_SEED) return process.env.AMANA_EVIDENCE_SEED;
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dirname(file), { recursive: true });
  const seed = Buffer.from(generateRandomSeed()).toString('hex');
  writeFileSync(file, seed + '\n', { mode: 0o600 });
  log(`Created a new test wallet seed in ${file} (gitignored).`);
  return seed;
};

const deriveKeys = (seedHex) => {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('Invalid wallet seed.');
  const derived = hd.hdWallet.selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Wallet key derivation failed.');
  hd.hdWallet.clear();
  return derived.keys;
};

/**
 * Build and start the wallet. Returns once it is running, not once it has
 * synced. With `stateFile`, resumes from the last checkpoint saved there, so a
 * second run does not rescan the chain from its first block.
 */
export const buildWallet = async (network, seedHex, stateFile) => {
  setNetworkId(network.networkId);
  const saved = stateFile && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
  const keys = deriveKeys(seedHex);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());
  const connection = { indexerHttpUrl: network.indexer, indexerWsUrl: network.indexerWS };
  const relayURL = new URL(network.node.replace(/^http/, 'ws'));
  const wallet = await WalletFacade.init({
    configuration: {
      networkId: getNetworkId(),
      indexerClientConnection: connection,
      provingServerUrl: new URL(network.proofServer),
      relayURL,
      txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    },
    shielded: (cfg) => saved ? ShieldedWallet(cfg).restore(saved.shielded)
      : ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => saved ? UnshieldedWallet(cfg).restore(saved.unshielded)
      : UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => saved ? DustWallet(cfg).restore(saved.dust)
      : DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  if (saved) log('Resumed the wallet from its last checkpoint.');
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, stateFile,
    address: unshieldedKeystore.getBech32Address() };
};

/** Checkpoint the wallet's sync state next to its seed. */
export const saveWallet = async (ctx) => {
  if (!ctx.stateFile) return;
  const state = {
    shielded: await ctx.wallet.shielded.serializeState(),
    unshielded: await ctx.wallet.unshielded.serializeState(),
    dust: await ctx.wallet.dust.serializeState(),
  };
  writeFileSync(ctx.stateFile, JSON.stringify(state), { mode: 0o600 });
};

const synced = (wallet, throttle = 5_000) =>
  wallet.state().pipe(Rx.throttleTime(throttle, undefined, { leading: true, trailing: true }), Rx.filter((s) => s.isSynced));

export const nightBalance = (state) => state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
export const dustBalance = (state) => state.dust.balance(new Date());

const progress = (wallet) => {
  const p = wallet?.progress;
  const n = (v) => (v === undefined || v === null ? '?' : v.toLocaleString('en-US'));
  return p ? `${n(p.appliedIndex)}/${n(p.highestIndex ?? p.highestRelevantIndex)}` : '?';
};

/** Wait for a full sync, logging progress and checkpointing once a minute meanwhile. */
export const waitForSync = async (ctx) => {
  const ticker = ctx.wallet.state().pipe(Rx.throttleTime(60_000), Rx.filter((s) => !s.isSynced)).subscribe((s) => {
    log(`Syncing: shielded ${progress(s.shielded)} · dust ${progress(s.dust)} · unshielded ${progress(s.unshielded)}`);
    saveWallet(ctx).catch(() => {});
  });
  try {
    const state = await Rx.firstValueFrom(synced(ctx.wallet));
    await saveWallet(ctx);
    return state;
  } finally {
    ticker.unsubscribe();
  }
};

/** Wait for tNIGHT, register it for DUST generation if needed, then wait for DUST. */
export const ensureFunded = async (ctx, minimumDust = 1n) => {
  let state = await waitForSync(ctx);
  if (nightBalance(state) === 0n) {
    log('Waiting for tNIGHT. Paste the address above into the faucet.');
    state = await Rx.firstValueFrom(synced(ctx.wallet, 10_000).pipe(Rx.filter((s) => nightBalance(s) > 0n)));
    log(`Received ${nightBalance(state).toLocaleString('en-US')} tNIGHT.`);
  }
  const unregistered = state.unshielded.availableCoins.filter((c) => c.meta?.registeredForDustGeneration !== true);
  if (unregistered.length > 0 && dustBalance(state) < minimumDust) {
    log(`Registering ${unregistered.length} tNIGHT output(s) for DUST generation…`);
    const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
      unregistered, ctx.unshieldedKeystore.getPublicKey(), (payload) => ctx.unshieldedKeystore.signData(payload));
    await ctx.wallet.submitTransaction(await ctx.wallet.finalizeRecipe(recipe));
    log('Registered. DUST now accrues over time.');
  }
  if (dustBalance(state) < minimumDust) {
    log(`Waiting for at least ${minimumDust.toLocaleString('en-US')} DUST…`);
    state = await Rx.firstValueFrom(synced(ctx.wallet, 30_000).pipe(Rx.filter((s) => dustBalance(s) >= minimumDust)));
  }
  await saveWallet(ctx);
  log(`Funded: ${nightBalance(state).toLocaleString('en-US')} tNIGHT, ${dustBalance(state).toLocaleString('en-US')} DUST.`);
  return state;
};

/**
 * Sign every unshielded offer in a transaction's intents with the right proof
 * marker. Works around the wallet SDK's signRecipe, which assumes 'pre-proof'
 * and fails on already-proven intents (as noted in the upstream example).
 */
const signIntents = (tx, sign, marker) => {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize('signature', marker, 'pre-binding', intent.serialize());
    const signature = sign(cloned.signatureData(segment));
    for (const offer of ['fallibleUnshieldedOffer', 'guaranteedUnshieldedOffer']) {
      if (cloned[offer]) {
        cloned[offer] = cloned[offer].addSignatures(
          cloned[offer].inputs.map((_, i) => cloned[offer].signatures.at(i) ?? signature));
      }
    }
    tx.intents.set(segment, cloned);
  }
};

/** The wallet and midnight providers midnight-js expects, backed by the facade. */
export const walletProviders = async (ctx) => {
  const state = await waitForSync(ctx);
  const provider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) });
      const sign = (payload) => ctx.unshieldedKeystore.signData(payload);
      signIntents(recipe.baseTransaction, sign, 'proof');
      if (recipe.balancingTransaction) signIntents(recipe.balancingTransaction, sign, 'pre-proof');
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx) => ctx.wallet.submitTransaction(tx),
  };
  return { walletProvider: provider, midnightProvider: provider };
};
