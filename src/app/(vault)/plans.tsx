import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Banner, IconButton, PressableScale, Screen, goBack } from '@/components/ui';
import { BillingUnavailable } from '@/lib/billing';
import { formatWhen } from '@/lib/format';
import { hapticSuccess } from '@/lib/haptics';
import { PLANS, TRIAL_DAYS, type PlanId } from '@/lib/plan';
import { usePlan } from '@/state/PlanContext';
import { font, theme, tint } from '@/theme';

const PERKS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'plus', title: 'Unlimited documents', body: 'Scan, import, and organise as many as you need.' },
  { icon: 'people', title: 'The whole family', body: 'A shelf for every person, from parents to kids.' },
  { icon: 'grid', title: 'Every tool', body: 'PDF conversion, collages, text reading, and page editing.' },
  { icon: 'shield', title: 'Private by design', body: 'Encrypted on this phone. No account, no cloud copy.' },
];

export default function PlansScreen() {
  const plan = usePlan();
  const [choice, setChoice] = useState<PlanId>('yearly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const status = plan.status;
  const selected = PLANS.find((item) => item.id === choice) ?? PLANS[0];

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await plan.subscribe(choice);
      hapticSuccess();
      goBack();
    } catch (error) {
      setMessage(error instanceof BillingUnavailable || error instanceof Error ? error.message : 'The purchase did not go through.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const found = await plan.restore();
      setMessage(found ? 'Your subscription is back.' : 'No subscription was found for this store account.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not restore purchases.');
    } finally {
      setBusy(false);
    }
  }

  const headline =
    status.kind === 'active'
      ? 'You are a member'
      : status.kind === 'expired'
        ? 'Your free trial has ended'
        : 'Keep your family’s papers safe';
  const lead =
    status.kind === 'active'
      ? `${status.plan === 'yearly' ? 'Yearly' : 'Monthly'} plan. Renews ${formatWhen(status.renewsAt)}.`
      : status.kind === 'expired'
        ? 'Your documents are still here and still yours. Subscribe to add new ones and use every tool again.'
        : `${status.daysLeft} ${status.daysLeft === 1 ? 'day' : 'days'} left in your free trial. Pick a plan now and nothing is charged until it ends.`;

  return (
    <Screen>
      <View style={styles.top}>
        <View style={styles.badge}>
          <Icon color={theme.gold} name="shield" size={16} />
          <Text style={styles.badgeText}>MODO Plus</Text>
        </View>
        <IconButton label="Close" name="close" onPress={() => goBack()} />
      </View>
      <Text style={styles.title}>{headline}</Text>
      <Text style={styles.lead}>{lead}</Text>

      <View style={styles.perks}>
        {PERKS.map((perk) => (
          <View key={perk.title} style={styles.perk}>
            <View style={styles.perkIcon}>
              <Icon color={theme.gold} name={perk.icon} size={20} />
            </View>
            <View style={styles.perkCopy}>
              <Text style={styles.perkTitle}>{perk.title}</Text>
              <Text style={styles.perkBody}>{perk.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {status.kind === 'active' ? null : (
        <>
          <View style={styles.plans}>
            {PLANS.map((item) => {
              const on = item.id === choice;
              return (
                <PressableScale
                  key={item.id}
                  accessibilityLabel={`${item.title} plan, ${item.price} ${item.period}`}
                  onPress={() => setChoice(item.id)}
                  style={[styles.plan, on ? styles.planOn : null]}
                >
                  <View style={[styles.radio, on ? styles.radioOn : null]}>{on ? <Icon color={theme.ink} name="check" size={14} weight={2.6} /> : null}</View>
                  <View style={styles.planCopy}>
                    <View style={styles.planHead}>
                      <Text style={styles.planTitle}>{item.title}</Text>
                      {item.badge ? <Text style={styles.planBadge}>{item.badge}</Text> : null}
                    </View>
                    <Text style={styles.planNote}>{item.note}</Text>
                  </View>
                  <View style={styles.planPrice}>
                    <Text style={styles.price}>{item.price}</Text>
                    <Text style={styles.period}>{item.period}</Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>

          {status.kind === 'trial' ? (
            <View style={styles.timeline}>
              <Step icon="unlock" title="Today" body="Full access, free." />
              <Step icon="clock" title={`Day ${TRIAL_DAYS - 1}`} body="Last free day. Cancel before tomorrow to pay nothing." />
              <Step icon="check" title={`Day ${TRIAL_DAYS}`} body={`${selected.price} ${selected.period}, unless you cancel.`} last />
            </View>
          ) : null}

          <Banner message={message} />
          <PressableScale accessibilityLabel="Subscribe" disabled={busy} onPress={() => void subscribe()} style={styles.cta}>
            <Text style={styles.ctaText}>
              {busy ? 'Working…' : status.kind === 'trial' ? `Continue with ${selected.title.toLowerCase()}` : `Subscribe for ${selected.price}`}
            </Text>
          </PressableScale>
          <Text style={styles.fine}>
            Billed through your app store account. Cancel anytime in the store’s subscription settings. Viewing, sharing, and exporting your documents always stay free.
          </Text>
          <PressableScale accessibilityLabel="Restore purchases" disabled={busy} onPress={() => void restore()} style={styles.restore}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </PressableScale>
        </>
      )}
    </Screen>
  );
}

function Step({ icon, title, body, last = false }: { icon: IconName; title: string; body: string; last?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <View style={styles.stepDot}>
          <Icon color={theme.ink} name={icon} size={14} weight={2.2} />
        </View>
        {last ? null : <View style={styles.stepLine} />}
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: tint(0.10),
  },
  badgeText: { color: theme.gold, fontFamily: font.semibold, fontSize: 13 },
  title: { color: theme.paper, fontFamily: font.display, fontSize: 30, lineHeight: 36, marginTop: 18 },
  lead: { color: theme.paperDim, fontFamily: font.body, fontSize: 16, lineHeight: 24, marginTop: 8 },
  perks: { marginTop: 22, gap: 14 },
  perk: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  perkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tint(0.10),
  },
  perkCopy: { flex: 1, minWidth: 0 },
  perkTitle: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  perkBody: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, lineHeight: 20, marginTop: 2 },
  plans: { marginTop: 26, gap: 10 },
  plan: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    padding: 14,
  },
  planOn: { borderColor: theme.gold, backgroundColor: tint(0.06) },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.paperFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: theme.gold, backgroundColor: theme.gold },
  planCopy: { flex: 1, minWidth: 0 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTitle: { color: theme.paper, fontFamily: font.semibold, fontSize: 17 },
  planBadge: {
    color: theme.ink,
    fontFamily: font.semibold,
    fontSize: 11,
    backgroundColor: theme.gold,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  planNote: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  planPrice: { alignItems: 'flex-end' },
  price: { color: theme.paper, fontFamily: font.display, fontSize: 22 },
  period: { color: theme.paperDim, fontFamily: font.medium, fontSize: 12 },
  timeline: { marginTop: 22 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 28 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.gold },
  stepLine: { flex: 1, width: 2, minHeight: 14, backgroundColor: tint(0.25) },
  stepCopy: { flex: 1, paddingBottom: 14, paddingTop: 3 },
  stepTitle: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  stepBody: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, marginTop: 1 },
  cta: { marginTop: 18, minHeight: 56, borderRadius: 18, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: theme.ink, fontFamily: font.semibold, fontSize: 17 },
  fine: { color: theme.paperFaint, fontFamily: font.body, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 },
  restore: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 4 },
  restoreText: { color: theme.gold, fontFamily: font.semibold, fontSize: 14 },
});
