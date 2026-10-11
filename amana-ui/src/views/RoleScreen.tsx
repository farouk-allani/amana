// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The four role screens, loaded as one chunk after the first paint. They use
 * the contract's witness helpers, which need the Midnight runtime.
 */

import React from 'react';

import type { AmanaDerivedState } from '../../../api/src/index.js';
import type { AmanaClient } from '../client.js';
import type { Role } from '../shell/Shell.jsx';
import { BorrowerView } from './borrower/BorrowerView.jsx';
import { IssuerView } from './issuer/IssuerView.jsx';
import { RegistryView } from './registry/RegistryView.jsx';
import { VerifierView } from './verifier/VerifierView.jsx';

export const RoleScreen: React.FC<{ role: Role; api: AmanaClient; state: AmanaDerivedState }> = ({
  role,
  api,
  state,
}) => {
  switch (role) {
    case 'borrower':
      return <BorrowerView api={api} state={state} />;
    case 'verifier':
      return <VerifierView api={api} state={state} />;
    case 'issuer':
      return <IssuerView api={api} state={state} />;
    case 'registry':
      return <RegistryView api={api} state={state} />;
  }
};

export default RoleScreen;
