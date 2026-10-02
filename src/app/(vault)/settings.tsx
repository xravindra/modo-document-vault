import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackButton, Banner, Headline, PressableScale, Quiet, Screen } from '@/components/ui';
import { PinPad } from '@/components/PinPad';
import { backupSummary } from '@/lib/backup';
import { deliverFile } from '@/lib/deliver';
import { formatWhen } from '@/lib/format';
import { pickBackupBytes } from '@/lib/pickBackup';
import { PIN_LENGTH } from '@/lib/pin';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

const LOCKS = [
  { ms: 0, label: 'When I leave' },
  { ms: 60_000, label: 'After 1 min' },
  { ms: 300_000, label: 'After 5 min' },
  { ms: -1, label: 'Only when I lock' },
];

export default function SettingsScreen() {
  const vault = useVault();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinStep, setPinStep] = useState<'idle' | 'current' | 'next' | 'confirm'>('idle');
  const [pin, setPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [pending, setPending] = useState<Uint8Array | null>(null);
  const [summary, setSummary] = useState<{ sealedFiles: number; exportedAt: number } | null>(null);
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  async function exportBackup() {
    setBusy(true);
    setMessage(null);
    try {
      const bytes = await vault.exportBackup();
      await deliverFile(`modo-vault-${new Date().toISOString().slice(0, 10)}.json`, bytes, 'application/json');
      setMessage('The backup holds every sealed file and the PIN wrap from this device. Keep that file off this phone. Anyone with the file and the PIN can open the vault.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function chooseBackup() {
    setMessage(null);
    try {
      const bytes = await pickBackupBytes();
      if (!bytes) return;
      setSummary(backupSummary(bytes));
      setPending(bytes);
    } catch (error) {
      setPending(null);
      setSummary(null);
      setMessage(error instanceof Error ? error.message : 'That file is not a MODO backup.');
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    try {
      await vault.importBackup(pending);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  function destroy() {
    setConfirmDestroy(false);
    void vault.destroy().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not destroy the vault.');
    });
  }

  async function submitPin(value: string) {
    setMessage(null);
    if (pinStep === 'current') {
      setBusy(true);
      const ok = await vault.verifyPin(value);
      setBusy(false);
      setPin('');
      if (!ok) {
        setMessage('That is not the current PIN.');
        return;
      }
      setPinStep('next');
      return;
    }
    if (pinStep === 'next') {
      setNextPin(value);
      setPin('');
      setPinStep('confirm');
      return;
    }
    if (value !== nextPin) {
      setMessage('Those new PINs do not match.');
      setPin('');
      setNextPin('');
      setPinStep('next');
      return;
    }
    setBusy(true);
    try {
      await vault.changePin(value);
      setPinStep('idle');
      setPin('');
      setNextPin('');
      setMessage('PIN updated. Sealed files were not re-encrypted. Only the key wrap changed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not change the PIN.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackButton href="/" label="Documents" />
      <Headline>Settings</Headline>
      <Quiet>Lock, fingerprint, PIN, and a backup you can keep somewhere else.</Quiet>
      <Banner message={message} />

      <View style={styles.panel}>
      <Text style={styles.label}>Auto-lock</Text>
      <View style={styles.row}>
        {LOCKS.map((option) => {
          const on = vault.settings.autoLockMs === option.ms;
          return (
            <PressableScale
              key={option.label}
              onPress={() => void vault.updateSettings({ autoLockMs: option.ms })}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{option.label}</Text>
            </PressableScale>
          );
        })}
      </View>
      </View>

      <View style={styles.panel}>
      <Text style={styles.label}>Unlock</Text>
      {vault.canUseBiometrics || vault.bioMode !== 'off' ? (
        <PressableScale
          disabled={busy}
          onPress={() => {
              void (async () => {
                try {
                  if (vault.settings.biometrics) await vault.disableBiometrics();
                  else await vault.enableBiometrics();
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Could not update biometrics.');
                }
              })();
            }}
          style={styles.lineButton}
        >
          <Text style={styles.lineText}>
            {vault.settings.biometrics
              ? vault.hasFingerprint
                ? 'Turn off fingerprint unlock'
                : 'Turn off biometrics'
              : vault.hasFingerprint
                ? 'Turn on fingerprint unlock'
                : 'Turn on biometrics'}
          </Text>
        </PressableScale>
      ) : null}
      {vault.hasFingerprint ? (
        <Text style={styles.note}>
          Fingerprint unlock uses the sensor enrolled on this phone. Turn it on here, then the lock screen can open the vault with that fingerprint. The PIN still works.
        </Text>
      ) : null}
      {!vault.canUseBiometrics && vault.bioMode === 'off' ? (
        <Text style={styles.note}>Biometrics appear on iPhones and Android phones that have Face ID or a fingerprint enrolled.</Text>
      ) : null}

      {pinStep === 'idle' ? (
        <PressableScale onPress={() => setPinStep('current')} style={styles.lineButton}>
          <Text style={styles.lineText}>Change PIN</Text>
        </PressableScale>
      ) : (
        <View>
          <Text style={styles.label}>
            {pinStep === 'current' ? 'Current PIN' : pinStep === 'next' ? 'New PIN' : 'Confirm new PIN'}
          </Text>
          <PinPad
            value={pin}
            length={PIN_LENGTH}
            disabled={busy}
            onChange={setPin}
            onComplete={(value) => void submitPin(value)}
          />
          <PressableScale
            onPress={() => {
              setPinStep('idle');
              setPin('');
              setNextPin('');
            }}
            style={styles.lineButton}
          >
            <Text style={styles.lineText}>Cancel</Text>
          </PressableScale>
        </View>
      )}
      </View>

      <View style={styles.panel}>
      <Text style={styles.label}>This device</Text>
      <PressableScale disabled={busy} onPress={() => void exportBackup()} style={styles.primary}>
        <Text style={styles.primaryText}>{busy ? 'Working…' : 'Export encrypted backup'}</Text>
      </PressableScale>
      {pending && summary ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            Restore {summary.sealedFiles} {summary.sealedFiles === 1 ? 'sealed file' : 'sealed files'} from {formatWhen(summary.exportedAt)}? This replaces the vault stored on this device.
          </Text>
          <PressableScale accessibilityLabel="Restore backup on this device" disabled={busy} onPress={() => void confirmRestore()} style={styles.primary}>
            <Text style={styles.primaryText}>Replace this device</Text>
          </PressableScale>
          <PressableScale
            accessibilityLabel="Cancel restore"
            disabled={busy}
            onPress={() => {
              setPending(null);
              setSummary(null);
            }}
            style={styles.lineButton}
          >
            <Text style={styles.lineText}>Cancel</Text>
          </PressableScale>
        </View>
      ) : (
        <PressableScale disabled={busy} onPress={() => void chooseBackup()} style={styles.lineButton}>
          <Text style={styles.lineText}>Restore a backup</Text>
        </PressableScale>
      )}
      {confirmDestroy ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            Encrypted files, the catalog, and the PIN wrap will be deleted from this device.
          </Text>
          <PressableScale onPress={destroy} style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>Destroy vault</Text>
          </PressableScale>
          <PressableScale onPress={() => setConfirmDestroy(false)} style={styles.lineButton}>
            <Text style={styles.lineText}>Cancel</Text>
          </PressableScale>
        </View>
      ) : (
        <PressableScale onPress={() => setConfirmDestroy(true)} style={styles.danger}>
          <Text style={styles.dangerText}>Destroy vault on this device</Text>
        </PressableScale>
      )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 22,
    borderRadius: 28,
    backgroundColor: theme.inkRaised,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 16,
  },
  label: {
    marginTop: 14,
    marginBottom: 12,
    color: theme.paperFaint,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, backgroundColor: theme.inkSoft, paddingHorizontal: 14, paddingVertical: 10 },
  chipOn: { backgroundColor: theme.paper },
  chipText: { color: theme.paper, fontFamily: font.medium, fontSize: 13 },
  chipTextOn: { color: theme.ink },
  note: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, lineHeight: 21, marginTop: 16, paddingHorizontal: 4 },
  lineButton: { marginTop: 8, paddingVertical: 12 },
  lineText: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  primary: { marginTop: 4, backgroundColor: theme.paper, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
  confirm: { marginTop: 8 },
  confirmText: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  danger: { marginTop: 8, paddingVertical: 12 },
  dangerText: { color: theme.danger, fontFamily: font.semibold, fontSize: 15 },
  dangerButton: { marginTop: 12, backgroundColor: theme.danger, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  dangerButtonText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
});
