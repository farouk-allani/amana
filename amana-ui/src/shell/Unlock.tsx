// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Setting or entering the passphrase that encrypts this browser's private
 * data. Asked for when it is first needed, not before, so the first thing a
 * visitor sees is what Amana is.
 */

import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, TriangleAlert } from 'lucide-react';

import { Alert, Button, Dialog, ErrorAlert, Field, IconButton, Input } from '../components/index.js';
import { MIN_PASSPHRASE, WrongPassphraseError, checkPassphrase, type Vault } from '../vault/vault.js';

const PassphraseInput: React.FC<{
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}> = ({ value, onChange, autoComplete, autoFocus, ...aria }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="passphrase">
      <Input
        {...aria}
        type={shown ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <IconButton label={shown ? 'Hide passphrase' : 'Show passphrase'} onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
      </IconButton>
    </div>
  );
};

export const UnlockDialog: React.FC<{
  vault: Vault;
  open: boolean;
  onClose: () => void;
  /** With how many values earlier versions had stored in clear, now sealed. */
  onUnlocked: (migrated: number) => void;
}> = ({ vault, open, onClose, onUnlocked }) => {
  const creating = vault.state === 'new';
  // Read when the dialog renders: identity keys and records left in clear.
  const inClear = open ? vault.plaintextKeys().length : 0;
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [forgot, setForgot] = useState(false);

  const reset = () => {
    setPass('');
    setAgain('');
    setError(null);
    setForgot(false);
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const weak = creating && pass ? checkPassphrase(pass) : null;
  const mismatch = creating && again && again !== pass ? 'The two passphrases differ.' : null;
  const ready = creating ? !checkPassphrase(pass) && pass === again : pass.length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { migrated } = creating ? await vault.create(pass) : await vault.unlock(pass);
      reset();
      onUnlocked(migrated);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!busy}
      icon={creating ? <KeyRound size={20} /> : <LockKeyhole size={20} />}
      title={creating ? 'Protect your private data' : 'Unlock your private data'}
      description={
        creating
          ? 'Choose a passphrase. It encrypts your identity key and records in this browser, and it is asked for each time you open Amana here.'
          : 'Enter the passphrase you chose for Amana in this browser.'
      }
      footer={
        forgot ? null : (
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="unlock-form" loading={busy} disabled={!ready}>
              {busy ? (creating ? 'Encrypting…' : 'Unlocking…') : creating ? 'Set passphrase' : 'Unlock'}
            </Button>
          </>
        )
      }
    >
      {forgot ? (
        <ForgotPassphrase
          onBack={() => setForgot(false)}
          onErase={() => {
            vault.erase();
            reset();
            onClose();
          }}
        />
      ) : (
        <form
          id="unlock-form"
          className="dialog-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !busy) void submit();
          }}
        >
          {creating && inClear > 0 && (
            <Alert tone="info" title="Earlier data found">
              An earlier version of Amana stored a key or records in this browser without encryption. They are
              encrypted with this passphrase as soon as you set it.
            </Alert>
          )}
          <Field
            label="Passphrase"
            hint={creating ? `At least ${MIN_PASSPHRASE} characters. A few unrelated words are strong and easy to remember.` : undefined}
            error={weak && pass.length >= 4 ? weak : undefined}
          >
            <PassphraseInput
              value={pass}
              onChange={setPass}
              autoComplete={creating ? 'new-password' : 'current-password'}
              autoFocus
            />
          </Field>
          {creating && (
            <Field label="The same passphrase again" error={mismatch ?? undefined}>
              <PassphraseInput value={again} onChange={setAgain} autoComplete="new-password" />
            </Field>
          )}
          {error !== null &&
            (error instanceof WrongPassphraseError ? (
              <Alert tone="error" title="That passphrase does not unlock this browser’s data">
                Check for typing mistakes and try again.
              </Alert>
            ) : (
              <ErrorAlert error={error} onDismiss={() => setError(null)} />
            ))}
          {creating ? (
            <Alert tone="warning" title="Nobody can reset it">
              Amana has no server and no copy. Without this passphrase the data in this browser cannot be read, so
              write it down somewhere safe.
            </Alert>
          ) : (
            <button type="button" className="link-button dialog-link" onClick={() => setForgot(true)}>
              Forgot the passphrase?
            </button>
          )}
        </form>
      )}
    </Dialog>
  );
};

const ForgotPassphrase: React.FC<{ onBack: () => void; onErase: () => void }> = ({ onBack, onErase }) => {
  const [sure, setSure] = useState(false);
  return (
    <div className="dialog-stack">
      <Alert tone="info" title="It cannot be recovered">
        The passphrase is the only key to the data in this browser; Amana keeps no copy. If you have an encrypted
        backup, you can erase this browser’s data, set a new passphrase and restore the backup.
      </Alert>
      <label className="confirm-check">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>
          I understand that erasing removes my identity key and records from this browser, and that without a backup
          they are gone.
        </span>
      </label>
      <div className="dialog-inline">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="danger" icon={<TriangleAlert size={15} aria-hidden />} disabled={!sure} onClick={onErase}>
          Erase this browser’s Amana data
        </Button>
      </div>
    </div>
  );
};
