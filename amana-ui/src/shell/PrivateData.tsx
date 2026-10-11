// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * What this browser holds, and keeping a copy of it: an encrypted backup
 * to download, restoring one, and locking.
 */

import React, { useRef, useState } from 'react';
import { DatabaseBackup, Download, FileUp, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';

import { Alert, Button, Dialog, ErrorAlert, Field, Input } from '../components/index.js';
import { WrongPassphraseError, type ImportResult, type Vault } from '../vault/vault.js';

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const WrongPass: React.FC<{ error: unknown; what: string }> = ({ error, what }) =>
  error instanceof WrongPassphraseError ? (
    <Alert tone="error" title={`That passphrase does not ${what}`}>
      Check for typing mistakes and try again.
    </Alert>
  ) : (
    <ErrorAlert error={error} />
  );

export const PrivateDataDialog: React.FC<{
  vault: Vault;
  open: boolean;
  onClose: () => void;
  /** Open on the restore section, for a new browser. */
  restoreFirst?: boolean;
}> = ({ vault, open, onClose, restoreFirst = false }) => {
  const [mode, setMode] = useState<'home' | 'backup' | 'restore'>(restoreFirst ? 'restore' : 'home');
  const close = () => {
    setMode('home');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="md"
      icon={<ShieldCheck size={20} />}
      title="Your private data"
      description="Your identity key and records are encrypted in this browser with your passphrase (AES-256-GCM). Nobody else has a copy, so keep a backup."
    >
      {mode === 'home' && (
        <div className="dialog-stack">
          <button type="button" className="choice" onClick={() => setMode('backup')}>
            <span className="choice-icon" aria-hidden>
              <DatabaseBackup size={20} />
            </span>
            <span className="choice-text">
              <b>Back up</b>
              <span>Download an encrypted file. Restoring it needs your passphrase.</span>
            </span>
          </button>
          <button type="button" className="choice" onClick={() => setMode('restore')}>
            <span className="choice-icon" aria-hidden>
              <RotateCcw size={20} />
            </span>
            <span className="choice-text">
              <b>Restore a backup</b>
              <span>Bring your key and records into this browser from a backup file.</span>
            </span>
          </button>
          <button type="button" className="choice" onClick={() => window.location.reload()}>
            <span className="choice-icon" aria-hidden>
              <LockKeyhole size={20} />
            </span>
            <span className="choice-text">
              <b>Lock now</b>
              <span>Forget the key until the passphrase is entered again.</span>
            </span>
          </button>
        </div>
      )}
      {mode === 'backup' && <Backup vault={vault} onBack={() => setMode('home')} />}
      {mode === 'restore' && <Restore vault={vault} onBack={() => setMode('home')} />}
    </Dialog>
  );
};

const Backup: React.FC<{ vault: Vault; onBack: () => void }> = ({ vault, onBack }) => {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  return (
    <form
      className="dialog-stack"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        vault
          .exportBackup(pass)
          .then((text) => {
            download(`amana-backup-${new Date().toISOString().slice(0, 10)}.json`, text);
            setDone(true);
            setPass('');
          })
          .catch(setError)
          .finally(() => setBusy(false));
      }}
    >
      <Field
        label="Your passphrase"
        hint="The backup is encrypted with it. Asking again now makes sure you can open the backup later."
      >
        <Input type="password" value={pass} autoComplete="current-password" autoFocus onChange={(e) => setPass(e.target.value)} />
      </Field>
      {error !== null && <WrongPass error={error} what="unlock this browser’s data" />}
      {done && (
        <Alert tone="success" title="Backup downloaded">
          Keep it somewhere other than this computer. It is useless without your passphrase, and your passphrase is
          useless without it.
        </Alert>
      )}
      <div className="dialog-inline dialog-inline-end">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" icon={<Download size={16} aria-hidden />} loading={busy} disabled={!pass}>
          Download encrypted backup
        </Button>
      </div>
    </form>
  );
};

const Restore: React.FC<{ vault: Vault; onBack: () => void }> = ({ vault, onBack }) => {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const file = useRef<HTMLInputElement>(null);

  if (result) {
    const changed = result.imported + result.overwritten;
    return (
      <div className="dialog-stack">
        <Alert tone={changed ? 'success' : 'info'} title={changed ? 'Backup restored' : 'Nothing new in this backup'}>
          {result.imported > 0 && <>Added {result.imported}. </>}
          {result.overwritten > 0 && <>Replaced {result.overwritten}. </>}
          {result.skipped > 0 && <>Kept {result.skipped} already in this browser. </>}
          {changed > 0 && 'Reload to use the restored key and records.'}
        </Alert>
        <div className="dialog-inline dialog-inline-end">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          {changed > 0 && (
            <Button icon={<RotateCcw size={16} aria-hidden />} onClick={() => window.location.reload()}>
              Reload now
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      className="dialog-stack"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        vault
          .importBackup(text, pass, replace)
          .then(setResult)
          .catch(setError)
          .finally(() => setBusy(false));
      }}
    >
      <div className="dialog-inline">
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Backup file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setName(f.name);
              void f.text().then(setText);
            }
            e.target.value = '';
          }}
        />
        <Button variant="secondary" size="sm" icon={<FileUp size={15} aria-hidden />} onClick={() => file.current?.click()}>
          Choose backup file
        </Button>
        <span className="dialog-inline-note">{name || 'No file chosen'}</span>
      </div>
      <Field label="The backup’s passphrase" hint="The passphrase this browser’s data used when the backup was made.">
        <Input type="password" value={pass} autoComplete="current-password" onChange={(e) => setPass(e.target.value)} />
      </Field>
      <label className="confirm-check">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        <span>Replace data this browser already holds for the same registry. Left unticked, existing data is kept.</span>
      </label>
      {error !== null && <WrongPass error={error} what="open this backup" />}
      <div className="dialog-inline dialog-inline-end">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" icon={<RotateCcw size={16} aria-hidden />} loading={busy} disabled={!text || !pass}>
          Restore
        </Button>
      </div>
    </form>
  );
};
