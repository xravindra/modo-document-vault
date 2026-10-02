import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui';
import { font, theme } from '@/theme';

type DockProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

export function Dock({ state, navigation }: DockProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const current = state.routes[state.index]?.name;
  if (current !== 'index') return null;

  return (
    <View pointerEvents="box-none" style={styles.slot}>
      <View
        style={[
          styles.bar,
          { width: width > 48 ? Math.min(width - 32, 400) : '100%', paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <PressableScale accessibilityLabel="Documents" onPress={() => navigation.navigate('index')} style={styles.tab}>
          <Text style={[styles.label, styles.labelOn]}>Documents</Text>
        </PressableScale>
        <PressableScale accessibilityLabel="Add a document" onPress={() => router.push('/add' as Href)} style={styles.add}>
          <Text style={styles.addText}>+</Text>
        </PressableScale>
        <PressableScale accessibilityLabel="Settings" onPress={() => router.push('/settings' as Href)} style={styles.tab}>
          <Text style={styles.label}>Settings</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    alignItems: 'center',
  },
  bar: {
    borderRadius: 36,
    backgroundColor: '#101012',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 10,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  label: { color: theme.paperFaint, fontFamily: font.medium, fontSize: 13 },
  labelOn: { color: theme.paper },
  add: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
  },
  addText: { color: theme.ink, fontSize: 32, lineHeight: 34, fontFamily: font.medium },
});
