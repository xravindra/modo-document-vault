import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui';
import { TRIAL_DAYS } from '@/lib/plan';
import { usePlan } from '@/state/PlanContext';
import { font, theme, tint, wash } from '@/theme';

export function PlanBanner() {
  const plan = usePlan();
  const status = plan.status;
  if (!plan.ready || status.kind === 'active') return null;
  const expired = status.kind === 'expired';
  const used = expired ? TRIAL_DAYS : TRIAL_DAYS - status.daysLeft;
  const title = expired
    ? 'Your free trial has ended'
    : `${status.daysLeft} ${status.daysLeft === 1 ? 'day' : 'days'} left in your free trial`;
  const body = expired ? 'Your documents are safe. Subscribe to add new ones.' : 'Everything is unlocked while you try MODO.';

  return (
    <PressableScale accessibilityLabel={`${title}. See plans`} onPress={() => router.push('/plans' as Href)} style={[styles.card, expired ? styles.cardEnded : null]}>
      <View style={styles.row}>
        <View style={[styles.icon, expired ? styles.iconEnded : null]}>
          <Icon color={expired ? theme.ink : theme.gold} name={expired ? 'lock' : 'clock'} size={20} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, expired ? styles.titleEnded : null]}>{title}</Text>
          <Text style={[styles.body, expired ? styles.bodyEnded : null]}>{body}</Text>
        </View>
        <Text style={[styles.action, expired ? styles.actionEnded : null]}>{expired ? 'Subscribe' : 'Plans'}</Text>
      </View>
      {expired ? null : (
        <View style={styles.track}>
          {Array.from({ length: TRIAL_DAYS }, (_, index) => (
            <View key={index} style={[styles.day, index < used ? styles.dayUsed : null]} />
          ))}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tint(0.25),
    backgroundColor: tint(0.06),
    padding: 14,
  },
  cardEnded: { backgroundColor: theme.paper, borderColor: theme.paper },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tint(0.12),
  },
  iconEnded: { backgroundColor: theme.gold },
  copy: { flex: 1, minWidth: 0 },
  title: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  titleEnded: { color: theme.ink },
  body: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  bodyEnded: { color: wash(0.75) },
  action: { color: theme.gold, fontFamily: font.semibold, fontSize: 15 },
  actionEnded: { color: theme.gold },
  track: { flexDirection: 'row', gap: 4, marginTop: 12 },
  day: { flex: 1, height: 4, borderRadius: 2, backgroundColor: tint(0.18) },
  dayUsed: { backgroundColor: theme.gold },
});
