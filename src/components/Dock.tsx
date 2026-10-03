import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/ui';
import { font, theme } from '@/theme';

type DockProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

const LEFT: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'library', label: 'Family', icon: 'people' },
];

const RIGHT: { name: string; label: string; icon: IconName }[] = [
  { name: 'activity', label: 'Activity', icon: 'clock' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export function Dock({ state, navigation }: DockProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const tab = (item: { name: string; label: string; icon: IconName }) => {
    const on = current === item.name || (item.name === 'settings' && current === 'security');
    return (
      <PressableScale key={item.name} accessibilityLabel={item.label} onPress={() => navigation.navigate(item.name)} style={styles.tab}>
        <Icon color={on ? theme.gold : theme.paperFaint} name={item.icon} size={24} weight={on ? 2.1 : 1.8} />
        <Text style={[styles.label, on ? styles.labelOn : null]}>{item.label}</Text>
      </PressableScale>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.inner}>
        {LEFT.map(tab)}
        <View style={styles.addSlot}>
          <PressableScale accessibilityLabel="Add a document" onPress={() => router.push('/add' as Href)} style={styles.add}>
            <Icon color={theme.ink} name="plus" size={28} weight={2.4} />
          </PressableScale>
        </View>
        {RIGHT.map(tab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.inkRaised,
    borderTopWidth: 1,
    borderTopColor: theme.line,
    alignItems: 'center',
  },
  inner: { width: '100%', maxWidth: 560, flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingHorizontal: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, gap: 3 },
  label: { color: theme.paperFaint, fontFamily: font.medium, fontSize: 12 },
  labelOn: { color: theme.gold, fontFamily: font.semibold },
  addSlot: { flex: 1, alignItems: 'center' },
  add: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -22,
    backgroundColor: theme.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: theme.ink,
  },
});
