import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui';
import { font, theme } from '@/theme';

type DockProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

const LEFT = [
  { name: 'index', label: 'Home' },
  { name: 'library', label: 'Library' },
];
const RIGHT = [
  { name: 'activity', label: 'Activity' },
  { name: 'security', label: 'Security' },
];

function Mark({ name, active }: { name: string; active: boolean }) {
  const color = active ? theme.gold : theme.paperFaint;
  if (name === 'index') {
    return (
      <View style={styles.icon}>
        <View style={[styles.roof, { borderBottomColor: color }]} />
        <View style={[styles.house, { borderColor: color }]} />
      </View>
    );
  }
  if (name === 'library') {
    return (
      <View style={styles.icon}>
        <View style={[styles.sheet, { borderColor: color }]} />
        <View style={[styles.sheetLine, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'activity') {
    return (
      <View style={styles.pulseRow}>
        <View style={[styles.pulse, { backgroundColor: color }]} />
        <View style={[styles.pulse, styles.pulseTall, { backgroundColor: color }]} />
        <View style={[styles.pulse, { backgroundColor: color }]} />
      </View>
    );
  }
  return <View style={[styles.seal, { borderColor: color }]} />;
}

function TabButton({
  label,
  name,
  active,
  onPress,
}: {
  label: string;
  name: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale accessibilityLabel={label} onPress={onPress} style={styles.tab}>
      <Mark name={name} active={active} />
      <Text style={[styles.label, active ? styles.labelOn : null]}>{label}</Text>
    </PressableScale>
  );
}

export function Dock({ state, navigation }: DockProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  if (!current || ![...LEFT, ...RIGHT].some((item) => item.name === current)) return null;

  return (
    <View pointerEvents="box-none" style={styles.slot}>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {LEFT.map((item) => (
        <TabButton
          key={item.name}
          {...item}
          active={current === item.name}
          onPress={() => navigation.navigate(item.name)}
        />
      ))}
      <PressableScale accessibilityLabel="Seal a document" onPress={() => router.push('/add' as Href)} style={styles.add}>
        <Text style={styles.addText}>+</Text>
      </PressableScale>
      {RIGHT.map((item) => (
        <TabButton
          key={item.name}
          {...item}
          active={current === item.name}
          onPress={() => navigation.navigate(item.name)}
        />
      ))}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    alignItems: 'center',
  },
  bar: {
    width: '92%',
    maxWidth: 528,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: 'rgba(16, 22, 20, 0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6 },
  label: { color: theme.paperFaint, fontFamily: font.medium, fontSize: 11 },
  labelOn: { color: theme.gold },
  add: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    marginTop: -22,
  },
  addText: { color: theme.ink, fontSize: 30, lineHeight: 32, fontFamily: font.medium },
  icon: { width: 18, height: 16, alignItems: 'center', justifyContent: 'flex-end' },
  roof: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  house: { width: 12, height: 8, borderWidth: 1.4, borderTopWidth: 0 },
  sheet: { width: 13, height: 15, borderWidth: 1.4, borderRadius: 2 },
  sheetLine: { position: 'absolute', width: 7, height: 1.4, top: 5 },
  pulseRow: { height: 16, flexDirection: 'row', alignItems: 'flex-end' },
  pulse: { width: 3, height: 8, borderRadius: 2, marginHorizontal: 1.5 },
  pulseTall: { height: 14 },
  seal: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
});
