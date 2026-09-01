// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import './globals.js';
import './styles.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as pino from 'pino';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import '@midnight-ntwrk/dapp-connector-api';

import App from './App.jsx';

const networkId = (import.meta.env.VITE_NETWORK_ID ?? 'TestNet') as NetworkId;
setNetworkId(networkId);

const logger = pino.pino({
  level: (import.meta.env.VITE_LOGGING_LEVEL as string) ?? 'info',
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App logger={logger} networkId={networkId} />
  </React.StrictMode>,
);
