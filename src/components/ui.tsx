import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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

import { Icon, type IconName } from '@/components/Icon';
import { font, theme } from '@/theme';

export const TAB_PATHS = ['/', '/library', '/activity', '/settings', '/security'];

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

type ScreenScroll = {
  scrollTo: (y: number) => void;
  contentRef: RefObject<View | null>;
};

const ScreenScrollContext = createContext<ScreenScroll | null>(null);

export function useScreenScroll(): ScreenScroll {
  return useContext(ScreenScrollContext) ?? { scrollTo: () => undefined, contentRef: { current: null } };
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
  const docked = TAB_PATHS.includes(pathname);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const frame = width > 0 ? { width, maxWidth: width } : { width: '100%' as const, maxWidth: '100%' as const };
  const body = (
    <View
      ref={contentRef}
      style={[
        styles.column,
        {
          width: width > 0 ? Math.min(width, 560) : '100%',
          maxWidth: '100%',
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + (docked ? 112 : 32),
        },
      ]}
    >
      {children}
    </View>
  );
  const scrollApi = {
    contentRef,
    scrollTo: (y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }),
  };
  return (
    <ScreenScrollContext.Provider value={scrollApi}>
      <View style={[styles.root, frame]}>
        <View style={styles.glow} pointerEvents="none" />
        {scroll ? (
          <ScrollView
            ref={scrollRef}
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
    </ScreenScrollContext.Provider>
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

export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function BackButton({ href, label = 'Back', style }: { href?: Href; label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={() => (href ? router.replace(href) : goBack())}
      style={[styles.back, style]}
    >
      <Icon color={theme.paper} name="back" size={20} />
      <Text style={styles.backText}>{label}</Text>
    </PressableScale>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  tone = 'plain',
  filled = false,
  disabled,
  style,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'accent' | 'danger';
  filled?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const color = tone === 'accent' ? theme.gold : tone === 'danger' ? theme.danger : theme.paper;
  return (
    <PressableScale accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.iconButton, style]}>
      <Icon color={color} filled={filled} name={name} />
    </PressableScale>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action ? (
        <PressableScale accessibilityLabel={action.label} onPress={action.onPress} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action.label}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.groupWrap}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

export function ListRow({
  icon,
  label,
  detail,
  value,
  onPress,
  disabled,
  tone = 'plain',
  toggle,
  last = false,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  value?: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'plain' | 'danger';
  toggle?: boolean;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const danger = tone === 'danger';
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.listRow, last ? null : styles.listRowLine]}
    >
      <View style={[styles.listIcon, danger ? styles.listIconDanger : null]}>
        <Icon color={danger ? theme.danger : theme.gold} name={icon} size={20} />
      </View>
      <View style={styles.listCopy}>
        <Text numberOfLines={1} style={[styles.listLabel, danger ? styles.listLabelDanger : null]}>
          {label}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={styles.listDetail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text numberOfLines={1} style={styles.listValue}>
          {value}
        </Text>
      ) : null}
      {toggle === undefined ? (
        danger ? null : <Icon color={theme.paperFaint} name="chevron" size={18} />
      ) : (
        <View style={[styles.switch, toggle ? styles.switchOn : null]}>
          <View style={[styles.knob, toggle ? styles.knobOn : null]} />
        </View>
      )}
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
    top: -160,
    right: -40,
    width: '70%',
    maxWidth: 360,
    aspectRatio: 1,
    borderRadius: 180,
    backgroundColor: 'rgba(180, 83, 26, 0.14)',
  },
  scroll: { alignItems: 'center', maxWidth: '100%' },
  column: { maxWidth: '100%', minWidth: 0, paddingHorizontal: 22, overflow: 'hidden' },
  disabled: { opacity: 0.45 },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingRight: 14,
    paddingLeft: 6,
    marginBottom: 12,
    marginLeft: -8,
    borderRadius: 999,
  },
  backText: { color: theme.paper, fontFamily: font.medium, fontSize: 16 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.inkRaised,
    borderWidth: 1,
    borderColor: theme.line,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: { color: theme.paper, fontFamily: font.semibold, fontSize: 18 },
  sectionAction: { minHeight: 36, justifyContent: 'center', paddingLeft: 12 },
  sectionActionText: { color: theme.gold, fontFamily: font.semibold, fontSize: 15 },
  groupWrap: { marginTop: 24 },
  groupTitle: {
    color: theme.paperDim,
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    overflow: 'hidden',
  },
  listRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  listRowLine: { borderBottomWidth: 1, borderBottomColor: theme.line },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180, 83, 26, 0.10)',
  },
  listIconDanger: { backgroundColor: 'rgba(155, 52, 44, 0.10)' },
  listCopy: { flex: 1, minWidth: 0 },
  listLabel: { color: theme.paper, fontFamily: font.medium, fontSize: 16 },
  listLabelDanger: { color: theme.danger },
  listDetail: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, lineHeight: 18, marginTop: 2 },
  listValue: { maxWidth: '40%', color: theme.paperDim, fontFamily: font.medium, fontSize: 14 },
  switch: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: theme.inkSoft,
  },
  switchOn: { backgroundColor: theme.gold },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.sheet },
  knobOn: { transform: [{ translateX: 18 }] },
  kicker: {
    color: theme.paperFaint,
    fontFamily: font.medium,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  headline: {
    color: theme.paper,
    fontFamily: font.display,
    fontSize: 32,
    lineHeight: 38,
    marginTop: 4,
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
    borderColor: 'rgba(155, 52, 44, 0.28)',
    backgroundColor: 'rgba(155, 52, 44, 0.08)',
    padding: 14,
  },
  bannerText: { color: theme.danger, fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
});
