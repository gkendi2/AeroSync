import Svg, { Circle, G, Line, Rect } from 'react-native-svg';

const BRAND_RED = '#C8102E';
const WHITE = '#FFFFFF';

type AeroSyncLogoProps = {
  /** Width and height in pixels. */
  size?: number;
  /**
   * "badge": white mark on a red rounded square (default).
   * "plain": the mark alone, in `color`, with no background.
   */
  variant?: 'badge' | 'plain';
  /** Mark colour for the "plain" variant. */
  color?: string;
};

/** AeroSync mark: a wing-shaped "A" with a take-off bar. */
export default function AeroSyncLogo({
  size = 40,
  variant = 'badge',
  color = BRAND_RED,
}: AeroSyncLogoProps) {
  const isBadge = variant === 'badge';
  const markColor = isBadge ? WHITE : color;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessibilityRole="image"
      accessibilityLabel="AeroSync"
    >
      {isBadge && <Rect width={100} height={100} rx={22} fill={BRAND_RED} />}

      <G
        transform={isBadge ? 'translate(17 17) scale(0.66)' : undefined}
        stroke={markColor}
        strokeLinecap="round"
        fill="none"
      >
        <Line x1={18} y1={86} x2={46} y2={14} strokeWidth={13} />
        <Line x1={74} y1={86} x2={46} y2={14} strokeWidth={13} />
        <Line x1={24} y1={66} x2={80} y2={48} strokeWidth={6} />
        <Circle cx={85.5} cy={46} r={4.2} fill={markColor} stroke="none" />
      </G>
    </Svg>
  );
}
