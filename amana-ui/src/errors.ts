// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Turn whatever was thrown into something a person can act on.
 *
 * The raw message is never thrown away: it stays available behind a
 * "Technical details" disclosure, because the person filing a bug report
 * needs it even when the person reading the screen does not.
 *
 * @module
 */

export type Explained = {
  /** One short line: what happened. */
  readonly title: string;
  /** What to do next, in plain words. */
  readonly body: string;
  /** The original message, for technical details. */
  readonly raw: string;
};

/**
 * The message we wrote in Compact, if this is a circuit assertion.
 *
 * Circuit failures arrive as `failed assert: <message>`. Those messages were
 * written for people, so the prefix is stripped and the sentence capitalised.
 */
export const describe = (e: unknown): string => {
  const raw = rawMessage(e);
  const assertion = /failed assert:\s*(.+)/.exec(raw);
  if (assertion?.[1]) {
    const sentence = assertion[1].trim();
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }
  return raw;
};

export const rawMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
};

const connectorCode = (e: unknown): string | null =>
  typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'DAppConnectorAPIError'
    ? String((e as { code?: unknown }).code)
    : null;

const sentence = (s: string): string => {
  const t = s.trim();
  if (!t) return t;
  const capital = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capital) ? capital : capital + '.';
};

type Rule = { test: RegExp; title: string; body: string };

/** Patterns from the wallet, the proof server, the indexer and our own API. */
const RULES: readonly Rule[] = [
  {
    test: /no compatible midnight lace wallet|window\.midnight/i,
    title: 'Lace wallet not found',
    body: 'Install the Lace Midnight Preview extension, enable it for this site, then reload the page.',
  },
  {
    test: /no proof server configured/i,
    title: 'No proof server set in Lace',
    body: 'In Lace, open Settings, then Midnight, and choose the local proof server (http://localhost:6300).',
  },
  {
    // providers.ts tags every proving failure with "proof server".
    test: /proof server|:6300/i,
    title: "Can't reach the proof server",
    body: 'Start the proof server on this computer (port 6300) and keep it running, then try again. Nothing was sent.',
  },
  {
    test: /user rejected|rejected by user|user denied|user declined|cancel+ed by user/i,
    title: 'Cancelled in Lace',
    body: 'The request was declined in the wallet, so nothing was sent. Try again when you are ready.',
  },
  {
    test: /insufficient|not enough (funds|dust)|no dust|dust.*(balance|fee)|fee.*dust/i,
    title: 'Not enough DUST for the fee',
    body: 'Your wallet needs DUST to pay network fees. Register tNIGHT for DUST generation in Lace and wait for it to accrue, then try again.',
  },
  {
    test: /network ?id|wrong network|network mismatch/i,
    title: 'Wallet is on a different network',
    body: 'Switch Lace to the same Midnight network as this app, then reconnect.',
  },
  {
    test: /registry not found/i,
    title: 'No registry at that address',
    body: 'Check the address, and that Lace is on the network the registry was deployed to.',
  },
  {
    test: /incompatible registry/i,
    title: 'This registry runs an older protocol',
    body: 'This app needs a protocol 3 registry. Join a current one, or deploy a fresh registry.',
  },
  {
    test: /private state is (missing|unreadable)/i,
    title: 'Your private data is not available',
    body: 'This device has no readable private data for this registry. Restore it from your encrypted backup.',
  },
  {
    test: /indexer|websocket|graphql|socket hang up|timed? ?out|failed to fetch|networkerror|load failed|econnrefused/i,
    title: 'Lost contact with the network',
    body: 'The Midnight indexer did not answer. Check your connection and try again in a moment.',
  },
];

export const explainError = (e: unknown): Explained => {
  const raw = rawMessage(e);
  const code = connectorCode(e);

  if (code === 'Rejected' || code === 'PermissionRejected') {
    return { title: 'Cancelled in Lace', body: 'The request was declined in the wallet, so nothing was sent.', raw };
  }
  if (code === 'Disconnected') {
    return { title: 'Lace disconnected', body: 'Reopen Lace, unlock it, and reconnect.', raw };
  }

  // A circuit assertion is already a sentence we wrote for people.
  if (/failed assert:/.test(raw)) {
    return {
      title: 'The contract refused this',
      body: sentence(describe(e)) + ' Nothing was recorded on chain.',
      raw,
    };
  }

  // A transaction that reached the chain and failed there.
  if (e instanceof Error && /TxFailedError/.test(e.name || e.constructor?.name || '')) {
    return {
      title: 'The network rejected the transaction',
      body: 'It was submitted but not applied, so nothing changed. Refresh and try again.',
      raw,
    };
  }

  for (const rule of RULES) {
    if (rule.test.test(raw)) return { title: rule.title, body: rule.body, raw };
  }

  // Our own API throws short sentences written for people; show them as-is.
  if (raw && raw.length <= 160 && !/[{}<>]|\bat\s+\S+\s+\(/.test(raw)) {
    return { title: sentence(raw.replace(/^Amana:\s*/, '')), body: '', raw };
  }

  return {
    title: 'Something went wrong',
    body: 'The operation did not complete and nothing was recorded. The technical details below say why.',
    raw,
  };
};
