const ACCENT = '15, 118, 110';
const INK = '15, 23, 42';
const DANGER = '180, 35, 24';

export const theme = {
  ink: '#F2F5F7',
  inkRaised: '#FFFFFF',
  inkSoft: '#E2E8EE',
  line: `rgba(${INK}, 0.09)`,
  paper: '#0F172A',
  paperDim: `rgba(${INK}, 0.64)`,
  paperFaint: `rgba(${INK}, 0.42)`,
  gold: '#0F766E',
  goldDeep: '#115E59',
  moss: '#4B6B63',
  danger: '#B42318',
  ok: '#15803D',
  sheet: '#FFFFFF',
};

/** Accent color at the given opacity, for washes, rings, and icon wells. */
export function tint(alpha: number): string {
  return `rgba(${ACCENT}, ${alpha})`;
}

/** Text color at the given opacity, for scrims and hairlines. */
export function shade(alpha: number): string {
  return `rgba(${INK}, ${alpha})`;
}

export function dangerTint(alpha: number): string {
  return `rgba(${DANGER}, ${alpha})`;
}

/** Background color at the given opacity, for text on dark or accent surfaces. */
export function wash(alpha: number): string {
  return `rgba(242, 245, 247, ${alpha})`;
}

export const font = {
  display: 'Fraunces_600SemiBold',
  displaySoft: 'Fraunces_500Medium',
  body: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
};
