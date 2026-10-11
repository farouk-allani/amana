// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** Read any check by its ID, as committed on chain. */

import React, { useState } from 'react';
import { FileSearch } from 'lucide-react';

import type { CheckOutcome } from '../../../../api/src/index.js';
import { utils } from '../../../../api/src/index.js';
import { useAppContext, type AmanaClient } from '../../client.js';
import { Alert, AsyncButton, Button, Dialog, ErrorAlert, Field, Input, Receipt, TechDetails, TechRow } from '../../components/index.js';

export const LookupDialog: React.FC<{ api: AmanaClient; open: boolean; onClose: () => void }> = ({ api, open, onClose }) => {
  const { networkId } = useAppContext();
  const [id, setId] = useState('');
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [error, setError] = useState<unknown>(null);
  const trimmed = id.trim().toLowerCase().replace(/^0x/, '');

  const close = () => {
    onClose();
    setId('');
    setOutcome(null);
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      icon={<FileSearch size={20} />}
      title="Look up a check"
      description="Anyone can read a check’s committed terms and result from the chain. Nothing else about the applicant is recorded."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
          <AsyncButton
            disabled={!utils.isHex32(trimmed)}
            onRun={async () => {
              setError(null);
              setOutcome(await api.readCheck(trimmed));
            }}
            onError={setError}
          >
            Look up
          </AsyncButton>
        </>
      }
    >
      <div className="dialog-stack">
        <Field label="Check ID" error={id.trim() && !utils.isHex32(id.trim()) ? 'That is not a 64-character check ID.' : undefined}>
          <Input
            mono
            value={id}
            spellCheck={false}
            autoComplete="off"
            placeholder="Paste a check ID"
            onChange={(e) => {
              setId(e.target.value);
              setOutcome(null);
            }}
          />
        </Field>
        {error !== null && <ErrorAlert error={error} onDismiss={() => setError(null)} />}
        {outcome && !outcome.exists && (
          <Alert tone="info" title="No check with this ID on this registry">
            It may not be committed yet, or it belongs to a different registry.
          </Alert>
        )}
        {outcome?.terms && (
          <div className="receipt-stage receipt-stage-compact">
            <Receipt
              status={outcome.answered ? 'cleared' : 'awaiting'}
              threshold={outcome.terms.minOnTime}
              from={outcome.terms.minPeriod}
              to={outcome.terms.maxPeriod}
              network={networkId}
              notTold={outcome.answered ? ['The exact number of repayments', 'Which institutions contributed', 'How many records were used'] : undefined}
            >
              <TechDetails tone="paper">
                <TechRow label="Verifier key" value={utils.bytesToHex(outcome.terms.verifier)} />
                <TechRow label="Bound response key" value={utils.bytesToHex(outcome.terms.recipient)} />
                {outcome.result && (
                  <TechRow label="One-time code" note="nullifier" value={utils.bytesToHex(outcome.result.nullifier)} />
                )}
              </TechDetails>
            </Receipt>
          </div>
        )}
      </div>
    </Dialog>
  );
};
