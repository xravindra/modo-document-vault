import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'people'
  | 'plus'
  | 'clock'
  | 'settings'
  | 'search'
  | 'share'
  | 'download'
  | 'upload'
  | 'heart'
  | 'back'
  | 'chevron'
  | 'more'
  | 'rotate'
  | 'trash'
  | 'lock'
  | 'unlock'
  | 'camera'
  | 'image'
  | 'file'
  | 'user'
  | 'tag'
  | 'pencil'
  | 'copy'
  | 'grid'
  | 'convert'
  | 'pageAdd'
  | 'text'
  | 'sparkle'
  | 'reset'
  | 'shield'
  | 'key'
  | 'close'
  | 'check'
  | 'list';

export function Icon({
  name,
  color,
  size = 22,
  weight = 1.8,
  filled = false,
}: {
  name: IconName;
  color: string;
  size?: number;
  weight?: number;
  filled?: boolean;
}) {
  const pen = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: weight,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {glyph(name, pen, color, filled)}
    </Svg>
  );
}

type Pen = {
  fill: 'none';
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
};

function glyph(name: IconName, pen: Pen, color: string, filled: boolean) {
  switch (name) {
    case 'home':
      return (
        <>
          <Path {...pen} d="M3.5 10.5L12 3.5l8.5 7" />
          <Path {...pen} d="M5.5 9v11h13V9" />
          <Path {...pen} d="M10 20v-5.5h4V20" />
        </>
      );
    case 'people':
      return (
        <>
          <Circle {...pen} cx="9" cy="8" r="3.2" />
          <Path {...pen} d="M3.5 19.5c.8-3.6 3-5.4 5.5-5.4s4.7 1.8 5.5 5.4" />
          <Circle {...pen} cx="16.8" cy="9" r="2.5" />
          <Path {...pen} d="M16.2 14.2c2.4.2 3.8 1.9 4.4 5" />
        </>
      );
    case 'plus':
      return <Path {...pen} d="M12 5v14M5 12h14" />;
    case 'clock':
      return (
        <>
          <Circle {...pen} cx="12" cy="12" r="8.5" />
          <Path {...pen} d="M12 7.5V12l3 2" />
        </>
      );
    case 'settings':
      return (
        <>
          <Path {...pen} d="M4 7h10M18.5 7H20M4 17h4M12.5 17H20" />
          <Circle {...pen} cx="16.2" cy="7" r="2.2" />
          <Circle {...pen} cx="10.2" cy="17" r="2.2" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle {...pen} cx="11" cy="11" r="6.5" />
          <Path {...pen} d="M16 16l4.5 4.5" />
        </>
      );
    case 'share':
      return (
        <>
          <Path {...pen} d="M12 3.5v11" />
          <Path {...pen} d="M7.5 8L12 3.5 16.5 8" />
          <Path {...pen} d="M5 12.5V20h14v-7.5" />
        </>
      );
    case 'download':
      return (
        <>
          <Path {...pen} d="M12 4v11" />
          <Path {...pen} d="M7.5 10.5L12 15l4.5-4.5" />
          <Path {...pen} d="M5 19.5h14" />
        </>
      );
    case 'upload':
      return (
        <>
          <Path {...pen} d="M12 15V4" />
          <Path {...pen} d="M7.5 8.5L12 4l4.5 4.5" />
          <Path {...pen} d="M5 19.5h14" />
        </>
      );
    case 'heart':
      return (
        <Path
          {...pen}
          fill={filled ? color : 'none'}
          d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"
        />
      );
    case 'back':
      return <Path {...pen} d="M15 5l-7 7 7 7" />;
    case 'chevron':
      return <Path {...pen} d="M9.5 6l6 6-6 6" />;
    case 'more':
      return (
        <>
          <Circle cx="5.5" cy="12" r="1.6" fill={color} />
          <Circle cx="12" cy="12" r="1.6" fill={color} />
          <Circle cx="18.5" cy="12" r="1.6" fill={color} />
        </>
      );
    case 'rotate':
      return (
        <>
          <Path {...pen} d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
          <Path {...pen} d="M19.5 4v4.5H15" />
        </>
      );
    case 'trash':
      return (
        <>
          <Path {...pen} d="M4 7h16" />
          <Path {...pen} d="M9 7V4.5h6V7" />
          <Path {...pen} d="M6.5 7l1 13h9l1-13" />
          <Path {...pen} d="M10.5 11v5M13.5 11v5" />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect {...pen} x="5" y="10.5" width="14" height="10" rx="2.2" />
          <Path {...pen} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </>
      );
    case 'unlock':
      return (
        <>
          <Rect {...pen} x="5" y="10.5" width="14" height="10" rx="2.2" />
          <Path {...pen} d="M8 10.5V8a4 4 0 0 1 7.6-1.7" />
        </>
      );
    case 'camera':
      return (
        <>
          <Path {...pen} d="M3.5 8.5h3.2l1.8-3h7l1.8 3h3.2v11h-17z" />
          <Circle {...pen} cx="12" cy="13.5" r="3.4" />
        </>
      );
    case 'image':
      return (
        <>
          <Rect {...pen} x="3.5" y="5" width="17" height="14" rx="2.2" />
          <Circle {...pen} cx="9" cy="10" r="1.6" />
          <Path {...pen} d="M3.5 17l5-4.5 4 3.5 3-2.5 5 4" />
        </>
      );
    case 'file':
      return (
        <>
          <Path {...pen} d="M6 3h8l5 5v13H6z" />
          <Path {...pen} d="M14 3v5h5" />
        </>
      );
    case 'user':
      return (
        <>
          <Circle {...pen} cx="12" cy="8" r="3.6" />
          <Path {...pen} d="M5 20c1-4 3.8-6 7-6s6 2 7 6" />
        </>
      );
    case 'tag':
      return (
        <>
          <Path {...pen} d="M3.5 12V4h8l9 9-8 8z" />
          <Circle {...pen} cx="8" cy="8.5" r="1.4" />
        </>
      );
    case 'pencil':
      return (
        <>
          <Path {...pen} d="M4 20l1-4.2L16 4.8l3.2 3.2L8.2 19z" />
          <Path {...pen} d="M14 7l3 3" />
        </>
      );
    case 'copy':
      return (
        <>
          <Rect {...pen} x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
          <Path {...pen} d="M15.5 8.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h3.5" />
        </>
      );
    case 'grid':
      return (
        <>
          <Rect {...pen} x="4" y="4" width="7" height="7" rx="1.5" />
          <Rect {...pen} x="13" y="4" width="7" height="7" rx="1.5" />
          <Rect {...pen} x="4" y="13" width="7" height="7" rx="1.5" />
          <Rect {...pen} x="13" y="13" width="7" height="7" rx="1.5" />
        </>
      );
    case 'convert':
      return (
        <>
          <Path {...pen} d="M4 9h14.5l-3.5-3.5" />
          <Path {...pen} d="M20 15H5.5L9 18.5" />
        </>
      );
    case 'pageAdd':
      return (
        <>
          <Path {...pen} d="M6 3h8l5 5v13H6z" />
          <Path {...pen} d="M12.5 11.5v6M9.5 14.5h6" />
        </>
      );
    case 'text':
      return <Path {...pen} d="M5 6.5h14M5 12h14M5 17.5h9" />;
    case 'sparkle':
      return <Path {...pen} d="M12 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" />;
    case 'reset':
      return (
        <>
          <Path {...pen} d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
          <Path {...pen} d="M4.5 4v4.5H9" />
        </>
      );
    case 'shield':
      return (
        <>
          <Path {...pen} d="M12 3l7 3v5.2c0 4.8-3 8.3-7 9.8-4-1.5-7-5-7-9.8V6z" />
          <Path {...pen} d="M9 12l2.2 2.2L15.5 10" />
        </>
      );
    case 'key':
      return (
        <>
          <Circle {...pen} cx="8" cy="15" r="4" />
          <Path {...pen} d="M11 12l8.5-8.5" />
          <Path {...pen} d="M16.5 6.5l2.2 2.2" />
        </>
      );
    case 'close':
      return <Path {...pen} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />;
    case 'check':
      return <Path {...pen} d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'list':
      return (
        <>
          <Path {...pen} d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
          <Circle cx="5" cy="6.5" r="1.2" fill={color} />
          <Circle cx="5" cy="12" r="1.2" fill={color} />
          <Circle cx="5" cy="17.5" r="1.2" fill={color} />
        </>
      );
  }
}
