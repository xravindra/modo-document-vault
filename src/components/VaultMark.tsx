import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { usePrefersReducedMotion } from '@/components/ui';
import { font, theme } from '@/theme';

function Ring({
  size,
  duration,
  reverse,
  reduced,
}: {
  size: number;
  duration: number;
  reverse?: boolean;
  reduced: boolean;
}) {
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    turn.value = withRepeat(withTiming(reverse ? -360 : 360, { duration, easing: Easing.linear }), -1, false);
  }, [duration, reduced, reverse, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View
      style={[
        styles.ring,
        style,
        { width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2 },
      ]}
    >
      <View style={styles.notch} />
    </Animated.View>
  );
}

export function VaultMark({ compact = false }: { compact?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const outer = compact ? 168 : 220;
  const middle = compact ? 124 : 164;
  const inner = compact ? 84 : 108;
  return (
    <View style={[styles.wrap, { height: outer, marginBottom: compact ? 12 : 28 }]}>
      <Ring size={outer} duration={22000} reduced={reduced} />
      <Ring size={middle} duration={14000} reverse reduced={reduced} />
      <Ring size={inner} duration={9000} reduced={reduced} />
      <View style={styles.core}>
        <Text style={styles.monogram}>M</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 26, 0.28)',
  },
  notch: {
    position: 'absolute',
    top: -3,
    alignSelf: 'center',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.gold,
  },
  core: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.paper,
  },
  monogram: { color: theme.ink, fontFamily: font.display, fontSize: 28, marginTop: -2 },
});
