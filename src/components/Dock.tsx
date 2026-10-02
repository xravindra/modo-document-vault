import { StyleSheet, Text, View } from 'react-native';
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
  const current = state.routes[state.index]?.name;
  if (current !== 'index') return null;

  return (
    <View pointerEvents="box-none" style={styles.slot}>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
    bottom: 0,
  },
  bar: {
    backgroundColor: theme.ink,
    borderTopWidth: 1,
    borderTopColor: theme.line,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  label: { color: theme.paperFaint, fontFamily: font.medium, fontSize: 13 },
  labelOn: { color: theme.paper },
  add: {
    minWidth: 72,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: theme.gold, fontSize: 28, lineHeight: 30, fontFamily: font.medium },
});
