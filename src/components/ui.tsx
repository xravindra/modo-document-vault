import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname, type Href } from 'expo-router';

import { font, theme } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const docked = pathname === '/' || pathname === '/library' || pathname === '/activity' || pathname === '/security';
  const frame = width > 0 ? { width, maxWidth: width } : { width: '100%' as const, maxWidth: '100%' as const };
  const body = (
    <View
      style={[
        styles.column,
        {
          width: width > 0 ? Math.min(width, 560) : '100%',
          maxWidth: '100%',
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + (docked ? 124 : 32),
        },
      ]}
    >
      {children}
    </View>
  );
  return (
    <View style={[styles.root, frame]}>
      <View style={styles.glow} pointerEvents="none" />
      {scroll ? (
        <ScrollView
          horizontal={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={frame}
          contentContainerStyle={[styles.scroll, frame]}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

export function PressableScale({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 16, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 320 });
      }}
      style={[animated, style, disabled ? styles.disabled : null]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function BackButton({ href, label = 'Back' }: { href?: Href; label?: string }) {
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={() => (href ? router.replace(href) : router.back())}
      style={styles.back}
    >
      <Text style={styles.backText}>{label}</Text>
    </PressableScale>
  );
}

export function Kicker({ children }: { children: string }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

export function Headline({ children }: { children: string }) {
  return <Text style={styles.headline}>{children}</Text>;
}

export function Quiet({ children }: { children: string }) {
  return <Text style={styles.quiet}>{children}</Text>;
}

export function Banner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.ink, alignItems: 'center', overflow: 'hidden' },
  glow: {
    position: 'absolute',
    top: -120,
    width: '80%',
    maxWidth: 420,
    aspectRatio: 1,
    borderRadius: 210,
    backgroundColor: 'rgba(224, 192, 138, 0.08)',
  },
  scroll: { alignItems: 'center', maxWidth: '100%' },
  column: { maxWidth: '100%', minWidth: 0, paddingHorizontal: 22, overflow: 'hidden' },
  disabled: { opacity: 0.45 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 12 },
  backText: { color: theme.gold, fontFamily: font.medium, fontSize: 15 },
  kicker: {
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  headline: {
    color: theme.paper,
    fontFamily: font.display,
    fontSize: 40,
    lineHeight: 46,
    marginTop: 8,
    maxWidth: '100%',
  },
  quiet: {
    color: theme.paperDim,
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: '100%',
  },
  banner: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(224, 139, 122, 0.45)',
    backgroundColor: 'rgba(224, 139, 122, 0.12)',
    padding: 14,
  },
  bannerText: { color: theme.danger, fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
});
