// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
//
// The wallet bridge follows MidnightWalletProvider in @midnight-ntwrk/testkit-js
// 5.0.0 (Apache-2.0); wallet construction was first adapted from
// midnightntwrk/example-counter (Apache-2.0), counter-cli/src/api.ts.

/**
 * A headless Midnight wallet for the scripted evidence run, on ledger 9
 * (wallet SDK 2).
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
import { Either } from 'effect';
import {
  DefaultForkSchedule, DustWallet, InMemoryTransactionHistoryStorage, NetworkId, ProtocolVersion, PublicKey,
  ShieldedWallet, UnshieldedWallet, WalletEntrySchema, WalletFacade, WalletSeeds, WalletTransaction,
  createKeystore, generateRandomSeed, mergeWalletEntries,
} from '@midnight-ntwrk/wallet-sdk';
import * as WalletLedger from '@midnight-ntwrk/wallet-sdk/ledger/v9';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/v9';
import { createLedger9MidnightProvider, createLedger9WalletProvider } from '@midnight-ntwrk/midnight-js-types';

// The wallet SDK's GraphQL subscriptions expect the `ws` implementation.
globalThis.WebSocket = WebSocket;

export const networks = {
  preview: {
    networkId: 'preview',
    walletNetworkId: NetworkId.NetworkId.Preview,
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'wss://rpc.preview.midnight.network',
    proofServer: process.env.AMANA_PROOF_SERVER ?? 'http://127.0.0.1:6300',
    faucet: 'https://faucet.preview.midnight.network/',
    explorer: 'https://preview.midnightexplorer.com',
  },
  // Preprod's indexer is hosted by Blockfrost. The project id is a credential,
  // so it comes from the environment and `publicIndexer` is the form recorded
  // in the published evidence. The node is Midnight's own public RPC: wallet
  // SDK 2 follows the chain's protocol version over a node subscription, which
  // Blockfrost's RPC WebSocket drops.
  get preprod() {
    const id = process.env.BLOCKFROST_PREPROD_PROJECT_ID;
    if (!id) throw new Error('Set BLOCKFROST_PREPROD_PROJECT_ID to the id of a Blockfrost "Midnight Preprod" project.');
    return {
      networkId: 'preprod',
      walletNetworkId: NetworkId.NetworkId.PreProd,
      indexer: `https://midnight-preprod.blockfrost.io/api/v0?project_id=${id}`,
      indexerWS: `wss://midnight-preprod.blockfrost.io/api/v0/ws?project_id=${id}`,
      publicIndexer: 'https://midnight-preprod.blockfrost.io/api/v0',
      node: process.env.AMANA_PREPROD_NODE ?? 'wss://rpc.preprod.midnight.network',
      proofServer: process.env.AMANA_PROOF_SERVER ?? 'http://127.0.0.1:6300',
      faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
      explorer: 'https://preprod.midnightexplorer.com',
    };
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

/**
 * Build and start the wallet. Returns once it is running, not once it has
 * synced. With `stateFile`, resumes from the last checkpoint saved there, so a
 * second run does not rescan the chain from its first block. A checkpoint from
 * the ledger 8 wallet (no version 2 tag) is not used.
 */
export const buildWallet = async (network, seedHex, stateFile) => {
  const raw = stateFile && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
  const saved = raw?.version === 2 ? raw : null;
  const seeds = WalletSeeds.fromMasterSeed(Buffer.from(seedHex, 'hex'));
  const unshieldedKeystore = createKeystore({ kind: 'schnorr', secret: seeds.unshielded }, network.walletNetworkId);
  const configuration = {
    forks: DefaultForkSchedule,
    networkId: network.walletNetworkId,
    indexerClientConnection: { indexerHttpUrl: network.indexer, indexerWsUrl: network.indexerWS },
    provers: { v9: { kind: 'server', url: new URL(network.proofServer) } },
    relayURL: new URL(network.node),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  };
  const restoreOr = async (restore, start) => {
    if (saved) {
      try { return await restore(); } catch { log('The saved wallet state could not be used; syncing from the start.'); }
    }
    return start();
  };
  const shielded = await restoreOr(() => ShieldedWallet(configuration).restore(saved.shielded),
    () => ShieldedWallet(configuration).startWithSeed(seeds.shielded));
  const unshielded = await restoreOr(() => UnshieldedWallet(configuration).restore(saved.unshielded),
    () => UnshieldedWallet(configuration).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)));
  const dust = await restoreOr(() => DustWallet(configuration).restore(saved.dust),
    () => DustWallet(configuration).startWithSeed(seeds.dust));
  const wallet = await WalletFacade.init({
    configuration, shielded: () => shielded, unshielded: () => unshielded, dust: () => dust,
  });
  await wallet.start(seeds);
  if (saved) log('Resumed the wallet from its last checkpoint.');
  return { wallet, seeds, unshieldedKeystore, stateFile,
    address: unshieldedKeystore.getBech32Address().asString() };
};

/** Checkpoint the wallet's sync state next to its seed. */
export const saveWallet = async (ctx) => {
  if (!ctx.stateFile) return;
  const state = {
    version: 2,
    shielded: await ctx.wallet.shielded.serializeState(),
    unshielded: await ctx.wallet.unshielded.serializeState(),
    dust: await ctx.wallet.dust.serializeState(),
  };
  writeFileSync(ctx.stateFile, JSON.stringify(state), { mode: 0o600 });
};

/** Synced on all three wallets, with the chain's protocol version settled (wallet SDK 2). */
const isSynced = (s) => s.shielded.progress.isStrictlyComplete() && s.dust.progress.isStrictlyComplete()
  && s.unshielded.progress?.isStrictlyComplete() === true && s.protocol?._tag === 'Settled';

const synced = (wallet, throttle = 5_000) =>
  wallet.state().pipe(Rx.throttleTime(throttle, undefined, { leading: true, trailing: true }), Rx.filter(isSynced));

export const nightBalance = (state) => state.unshielded.balances[unshieldedToken().raw] ?? 0n;
export const dustBalance = (state) => state.dust.balance(new Date());

const progress = (wallet) => {
  const p = wallet?.progress;
  const n = (v) => (v === undefined || v === null ? '?' : v.toLocaleString('en-US'));
  return p ? `${n(p.appliedIndex)}/${n(p.highestIndex ?? p.highestRelevantIndex)}` : '?';
};

/** Wait for a full sync, logging progress and checkpointing once a minute meanwhile. */
export const waitForSync = async (ctx) => {
  const ticker = ctx.wallet.state().pipe(Rx.throttleTime(60_000), Rx.filter((s) => !isSynced(s))).subscribe((s) => {
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
      unregistered, ctx.unshieldedKeystore.getPublicKey(), (payload) => ctx.unshieldedKeystore.signDataAsync(payload));
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

const activeVersion = async (wallet) => (await Rx.firstValueFrom(wallet.state())).activeProtocolVersion;

/** A midnight-js transaction handle, read by the wallet SDK's own ledger copy and adopted by the facade. */
const adopt = async (wallet, stage, tx) => {
  const marker = stage === 'Unbound' ? 'pre-binding' : 'binding';
  return WalletTransaction.adopt(stage,
    WalletLedger.Transaction.deserialize('signature', 'proof', marker, tx.serialize()), await activeVersion(wallet));
};

/** The bytes of a finalized wallet SDK handle, for midnight-js to seal. */
const bytesOf = async (wallet, handle) => {
  const epoch = ProtocolVersion.epochOf(await activeVersion(wallet), DefaultForkSchedule.v9);
  const unwrapped = WalletTransaction.unwrapWithin(handle, epoch);
  if (Either.isLeft(unwrapped)) throw unwrapped.left;
  return unwrapped.right.serialize();
};

/** The wallet and midnight providers midnight-js expects, backed by the facade. */
export const walletProviders = async (ctx) => {
  const state = await waitForSync(ctx);
  const walletProvider = createLedger9WalletProvider({
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(await adopt(ctx.wallet, 'Unbound', tx),
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) });
      const signed = await ctx.wallet.signRecipe(recipe, (payload) => ctx.unshieldedKeystore.signDataAsync(payload));
      return bytesOf(ctx.wallet, await ctx.wallet.finalizeRecipe(signed));
    },
  });
  const midnightProvider = createLedger9MidnightProvider(
    async (tx) => ctx.wallet.submitTransaction(await adopt(ctx.wallet, 'Finalized', tx)));
  return { walletProvider, midnightProvider };
};
