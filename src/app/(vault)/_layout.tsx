import { Stack } from 'expo-router';

import { BootScreen, LockScreen } from '@/components/LockScreen';
import { useVault } from '@/state/VaultContext';
import { theme } from '@/theme';

export default function VaultLayout() {
  const vault = useVault();
  if (vault.status === 'booting') return <BootScreen />;
  if (vault.status !== 'unlocked') return <LockScreen />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: theme.ink },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="plans" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="document/[id]" options={{ animation: 'fade_from_bottom' }} />
    </Stack>
  );
}
