import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

function clampScale(value: number): number {
  return Math.min(4, Math.max(0.6, value));
}

export function ZoomFrame({
  rotation = 0,
  resetKey = 0,
  onSwipe,
  onZoomed,
  children,
}: {
  rotation?: number;
  resetKey?: number;
  onSwipe?: (step: number) => void;
  onZoomed?: (zoomed: boolean) => void;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const away = useSharedValue(0);
  const clipRef = useRef<View>(null);
  const onZoomedRef = useRef(onZoomed);
  onZoomedRef.current = onZoomed;

  const reportZoom = useCallback((value: number) => {
    onZoomedRef.current?.(Math.abs(value - 1) > 0.04);
  }, []);

  useEffect(() => {
    scale.value = 1;
    saved.value = 1;
    away.value = 0;
    reportZoom(1);
  }, [away, reportZoom, resetKey, scale, saved]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const node = clipRef.current as unknown as { addEventListener?: unknown } | null;
    if (!node || typeof node.addEventListener !== 'function') return undefined;
    const el = node as unknown as HTMLElement;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const next = clampScale(saved.value * Math.exp(-event.deltaY * 0.002));
      saved.value = next;
      scale.value = next;
      const flag = Math.abs(next - 1) > 0.04 ? 1 : 0;
      if (flag === away.value) return;
      away.value = flag;
      reportZoom(next);
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, [away, reportZoom, saved, scale]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const next = clampScale(saved.value * event.scale);
      scale.value = next;
      const flag = Math.abs(next - 1) > 0.04 ? 1 : 0;
      if (flag === away.value) return;
      away.value = flag;
      runOnJS(reportZoom)(next);
    })
    .onEnd(() => {
      saved.value = scale.value;
      runOnJS(reportZoom)(scale.value);
    });

  const swipe = Gesture.Pan()
    .activeOffsetX([-28, 28])
    .failOffsetY([-18, 18])
    .onEnd((event) => {
      if (!onSwipe || saved.value > 1.08) return;
      const next = event.translationX < -56 || event.velocityX < -700;
      const previous = event.translationX > 56 || event.velocityX > 700;
      if (next) runOnJS(onSwipe)(1);
      else if (previous) runOnJS(onSwipe)(-1);
    });

  const animated = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation}deg` }, { scale: scale.value }],
  }));

  return (
    <View ref={clipRef} style={styles.clip}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, swipe)}>
        <Animated.View style={[styles.frame, animated]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { width: '100%', height: '100%', overflow: 'hidden' },
  frame: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
});
