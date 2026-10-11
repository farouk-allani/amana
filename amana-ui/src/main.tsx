// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import './globals.js';
// Fonts are bundled rather than fetched from a font CDN: a privacy product
// should not tell a third party who opened it.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './styles/index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as pino from 'pino';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import '@midnight-ntwrk/dapp-connector-api';

import App from './App.jsx';

// Must match the network the connected Lace wallet is on, or `connect` is
// refused. Valid ids: 'preview', 'preprod', 'mainnet', 'undeployed'. The old
// 'TestNet' default named testnet-02, which has been retired — its endpoints
// no longer resolve, so it failed with a confusing indexer error rather than a
// clear one.
const networkId = (import.meta.env.VITE_NETWORK_ID ?? 'preview') as NetworkId;
setNetworkId(networkId);

const logger = pino.pino({
  level: (import.meta.env.VITE_LOGGING_LEVEL as string) ?? 'info',
});

// Development only: `?gallery` shows every shared component. The condition is
// a compile-time constant, so production builds drop the import entirely.
const Gallery =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('gallery')
    ? React.lazy(() => import('./dev/Gallery.jsx'))
    : null;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {Gallery ? (
      <React.Suspense fallback={null}>
        <Gallery />
      </React.Suspense>
    ) : (
      <App logger={logger} networkId={networkId} />
    )}
  </React.StrictMode>,
);
