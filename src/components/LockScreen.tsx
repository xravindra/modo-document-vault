import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PinDots, PinPad } from '@/components/PinPad';
import { Banner, PressableScale } from '@/components/ui';
import { VaultMark } from '@/components/VaultMark';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export function LockScreen() {
  const vault = useVault();
  const insets = useSafeAreaInsets();
  const compact = useWindowDimensions().height < 780;
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const shake = useSharedValue(0);
  const paused = lockedUntil > now;

  useEffect(() => {
    if (!paused) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [paused]);

  function shakeDots(text: string) {
    hapticError();
    shake.value = withSequence(
      withTiming(-14, { duration: 45 }),
      withTiming(12, { duration: 45 }),
      withTiming(-8, { duration: 40 }),
      withTiming(0, { duration: 40 }),
    );
    setMessage(text);
    setPin('');
  }

  async function submit(next: string) {
    if (paused || busy) return;
    vault.clearError();
    setMessage(null);
    if (!vault.hasVault) {
      if (step === 'enter') {
        setFirst(next);
        setPin('');
        setStep('confirm');
        return;
      }
      if (next !== first) {
        setStep('enter');
        setFirst('');
        shakeDots('Those PINs do not match. Start again.');
        return;
      }
      setBusy('Sealing the vault key…');
      try {
        await vault.createVault(next);
        hapticSuccess();
      } catch (error) {
        shakeDots(error instanceof Error ? error.message : 'Could not create the vault.');
      } finally {
        setBusy('');
      }
      return;
    }

    setBusy('Checking the seal…');
    try {
      await vault.unlock(next, failures);
      hapticSuccess();
      setFailures(0);
    } catch (error) {
      const count = failures + 1;
      setFailures(count);
      if (count >= 5) {
        setLockedUntil(Date.now() + 30_000);
        setFailures(0);
        shakeDots('Too many attempts. The pad pauses for 30 seconds.');
      } else {
        const left = 5 - count;
        const reason = error instanceof Error ? error.message : 'That PIN does not open this vault.';
        shakeDots(`${reason} ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`);
      }
    } finally {
      setBusy('');
    }
  }

  async function biometric() {
    if (busy || paused) return;
    setBusy('Waiting for biometrics…');
    setMessage(null);
    try {
      await vault.unlockWithBiometrics();
      hapticSuccess();
    } catch (error) {
      shakeDots(error instanceof Error ? error.message : 'Biometric unlock was cancelled.');
    } finally {
      setBusy('');
    }
  }

  const title = !vault.hasVault ? (step === 'confirm' ? 'Confirm the PIN' : 'Choose a PIN') : 'Welcome back';
  const subtitle = !vault.hasVault
    ? 'Six digits wrap the vault key. MODO does not store the PIN. A short PIN stops someone holding the phone. It is not a strong password if a backup leaves the device.'
    : 'Enter the PIN that opens this device’s vault.';

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.column}>
        <VaultMark compact={compact} />
        <Text style={styles.kicker}>MODO</Text>
        <Text style={[styles.title, compact ? styles.titleCompact : null]}>{title}</Text>
        <Text style={styles.subtitle}>{busy || subtitle}</Text>
        <PinDots length={pin.length} shake={shake} />
        <Banner message={paused ? `Try again in ${Math.ceil((lockedUntil - now) / 1000)}s.` : message || vault.error} />
        <PinPad value={pin} disabled={!!busy || paused} onChange={setPin} onComplete={(next) => void submit(next)} />
        {vault.hasVault && vault.biometricsReady ? (
          <PressableScale accessibilityLabel="Unlock with biometrics" onPress={() => void biometric()} style={styles.bio}>
            <Text style={styles.bioText}>Use Face ID or fingerprint</Text>
          </PressableScale>
        ) : null}
        <Text style={styles.footer}>AES-256-GCM · on this device · offline</Text>
      </View>
    </View>
  );
}

export function BootScreen() {
  return (
    <View style={styles.root}>
      <VaultMark />
      <Text style={styles.footer}>Opening the vault</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.ink, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: 'rgba(224, 192, 138, 0.07)',
  },
  column: { width: '100%', maxWidth: 460, paddingHorizontal: 24 },
  kicker: {
    color: theme.gold,
    fontFamily: font.semibold,
    letterSpacing: 3,
    fontSize: 12,
    textAlign: 'center',
  },
  title: {
    color: theme.paper,
    fontFamily: font.display,
    fontSize: 36,
    textAlign: 'center',
    marginTop: 6,
  },
  titleCompact: { fontSize: 30 },
  subtitle: {
    color: theme.paperDim,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  bio: { marginTop: 14, alignItems: 'center', padding: 12 },
  bioText: { color: theme.gold, fontFamily: font.medium, fontSize: 15 },
  footer: {
    color: theme.paperFaint,
    fontFamily: font.medium,
    fontSize: 12,
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 16,
  },
});
