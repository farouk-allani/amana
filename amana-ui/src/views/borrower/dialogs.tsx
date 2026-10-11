// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** The borrower's two errands: share an identifier, add a record. */

import React, { useRef, useState } from 'react';
import { FilePlus2, FileUp, Fingerprint } from 'lucide-react';

import { utils } from '../../../../api/src/index.js';
import type { AmanaClient } from '../../client.js';
import { Alert, AsyncButton, Button, Dialog, ErrorAlert, Field, Input, ShareValue, Textarea } from '../../components/index.js';

/**
 * Derive the identifier this borrower shows one institution.
 *
 * Every institution gets a different one, so institutions comparing their
 * books cannot find a shared customer. The institution it is given to can
 * still tie it to the account the borrower holds there.
 */
export const ShareIdentifierDialog: React.FC<{ api: AmanaClient; open: boolean; onClose: () => void }> = ({
  api,
  open,
  onClose,
}) => {
  const [key, setKey] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<unknown>(null);
  const trimmed = key.trim();
  const invalid = trimmed.length > 0 && !utils.isHex32(trimmed);

  const close = () => {
    onClose();
    setKey('');
    setIdentifier('');
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      icon={<Fingerprint size={20} />}
      title="Share your identifier with an institution"
      description="An institution needs your identifier for it before it can issue you a record. Each institution gets a different one, so no two can tell they share you as a customer."
      footer={
        identifier ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <AsyncButton
              disabled={!utils.isHex32(trimmed)}
              onRun={async () => {
                setError(null);
                setIdentifier(await api.subjectIdFor(trimmed));
              }}
              onError={setError}
            >
              Create identifier
            </AsyncButton>
          </>
        )
      }
    >
      <div className="dialog-stack">
        <Field
          label="The institution’s key"
          hint="The institution shows this on its Amana screen. 64 hexadecimal characters."
          error={invalid ? 'That is not a 64-character key.' : undefined}
        >
          <Input
            mono
            value={key}
            spellCheck={false}
            autoComplete="off"
            placeholder="Paste the institution’s key"
            onChange={(e) => {
              setKey(e.target.value);
              setIdentifier('');
            }}
          />
        </Field>
        {error !== null && <ErrorAlert error={error} onDismiss={() => setError(null)} />}
        {identifier && (
          <ShareValue
            label="Your identifier at this institution"
            value={identifier}
            hint="Send it through the channel you already use with this institution. It only works for them."
          />
        )}
      </div>
    </Dialog>
  );
};

/** Add a record an institution issued, pasted or from a downloaded file. */
export const AddRecordDialog: React.FC<{
  api: AmanaClient;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}> = ({ api, open, onClose, onAdded }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const file = useRef<HTMLInputElement>(null);

  const close = () => {
    onClose();
    setText('');
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      icon={<FilePlus2 size={20} />}
      title="Add a repayment record"
      description="Paste the record your institution gave you, or open the file they sent. It is checked against the registry before it is added."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <AsyncButton
            disabled={!text.trim()}
            onRun={async () => {
              setError(null);
              await api.importCredential(text);
              close();
              onAdded();
            }}
            onError={setError}
          >
            Add to passport
          </AsyncButton>
        </>
      }
    >
      <div className="dialog-stack">
        <Field label="Record" hint="A block of text that starts with “{”. It is the record itself, not a link to one.">
          <Textarea
            mono
            rows={7}
            value={text}
            spellCheck={false}
            placeholder={'{\n  "v": 2,\n  …\n}'}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="dialog-inline">
          <input
            ref={file}
            type="file"
            accept="application/json,.json,.txt"
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Record file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(setText);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" size="sm" icon={<FileUp size={15} aria-hidden />} onClick={() => file.current?.click()}>
            Open a file
          </Button>
          <span className="dialog-inline-note">Records stay in this browser. Nothing is uploaded.</span>
        </div>
        {error !== null && <ErrorAlert error={error} onDismiss={() => setError(null)} />}
        <Alert tone="info" title="A record only works for you">
          It is bound to your identifier at the issuing institution, so a record issued to someone else is refused.
        </Alert>
      </div>
    </Dialog>
  );
};
