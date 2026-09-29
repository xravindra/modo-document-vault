import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import * as DocumentPicker from 'expo-document-picker';
import { BackButton, Banner, Headline, Kicker, PressableScale, Quiet, Screen } from '@/components/ui';
import { PinPad } from '@/components/PinPad';
import { deliverFile } from '@/lib/deliver';
import { readSource } from '@/lib/readSource';
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

  async function exportBackup() {
    setBusy(true);
    setMessage(null);
    try {
      const bytes = await vault.exportBackup();
      await deliverFile(`modo-vault-${new Date().toISOString().slice(0, 10)}.json`, bytes, 'application/json');
      setMessage('Encrypted backup is ready. Anyone with that file and your PIN can open the vault.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function importBackup() {
    setMessage(null);
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, base64: false });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      const bytes = await readSource({
        uri: asset.uri,
        base64: asset.base64,
        file: 'file' in asset ? (asset.file as { arrayBuffer(): Promise<ArrayBuffer> } | undefined) : undefined,
      });
      await vault.importBackup(bytes);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  function destroy() {
    Alert.alert('Destroy this vault?', 'Encrypted files, the catalog, and the PIN wrap will be deleted from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Destroy',
        style: 'destructive',
        onPress: () => {
          void vault.destroy().catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : 'Could not destroy the vault.');
          });
        },
      },
    ]);
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
      <BackButton label="Security" />
      <Kicker>Settings</Kicker>
      <Headline>Hold the vault</Headline>
      <Quiet>Changing the PIN re-wraps the key. It does not rewrite every file.</Quiet>
      <Banner message={message} />

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

      {vault.biometricsReady || vault.bioMode !== 'off' ? (
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
          <Text style={styles.lineText}>{vault.settings.biometrics ? 'Turn off biometrics' : 'Turn on biometrics'}</Text>
        </PressableScale>
      ) : (
        <Text style={styles.note}>Biometrics appear on iPhones and Android phones that have Face ID or a fingerprint enrolled.</Text>
      )}

      {pinStep === 'idle' ? (
        <PressableScale onPress={() => setPinStep('current')} style={styles.lineButton}>
          <Text style={styles.lineText}>Change PIN</Text>
        </PressableScale>
      ) : (
        <View>
          <Text style={styles.label}>
            {pinStep === 'current' ? 'Current PIN' : pinStep === 'next' ? 'New PIN' : 'Confirm new PIN'}
          </Text>
          <PinPad value={pin} disabled={busy} onChange={setPin} onComplete={(value) => void submitPin(value)} />
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

      <PressableScale disabled={busy} onPress={() => void exportBackup()} style={styles.primary}>
        <Text style={styles.primaryText}>{busy ? 'Working…' : 'Export encrypted backup'}</Text>
      </PressableScale>
      <PressableScale disabled={busy} onPress={() => void importBackup()} style={styles.lineButton}>
        <Text style={styles.lineText}>Import a backup</Text>
      </PressableScale>
      <PressableScale onPress={destroy} style={styles.danger}>
        <Text style={styles.dangerText}>Destroy vault on this device</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 22,
    marginBottom: 10,
    color: theme.paperDim,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: theme.gold, borderColor: theme.gold },
  chipText: { color: theme.paper, fontFamily: font.medium, fontSize: 13 },
  chipTextOn: { color: theme.ink },
  note: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, lineHeight: 21, marginTop: 16 },
  lineButton: { marginTop: 14, paddingVertical: 12 },
  lineText: { color: theme.gold, fontFamily: font.semibold, fontSize: 16 },
  primary: { marginTop: 22, backgroundColor: theme.gold, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
  danger: { marginTop: 8, paddingVertical: 14 },
  dangerText: { color: theme.danger, fontFamily: font.semibold, fontSize: 15 },
});
