import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { MockMap, Text } from '@/components/ui';
import { categoryColors, radius as radii, shadow, useTheme } from '@/theme';

type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface PlaceMarker {
  id: string;
  icon: string; // MaterialCommunityIcons name
}

interface Props {
  /** Height of the visible frame. */
  height?: number;
  /** Colour of the pin, ring and markers (#RRGGBB). Defaults to the geofence colour. */
  tint?: string;
  /** Caption chip in the bottom-left corner. */
  label?: string;
  /** Shows this place icon on the centre pin instead of the default glyph. */
  pinIcon?: string;
  /** Geofence radius in metres. Draws an alert zone around the pin. */
  radiusMeters?: number;
  /** Saved places to dot around the map. */
  markers?: PlaceMarker[];
}

/** Width ÷ height of the MockMap artwork (its viewBox is 320 × 200). */
const ART_RATIO = 1.6;
/** Used until the frame has been measured: right for a phone-width card. */
const FALLBACK_ART_HEIGHT = 204;

/** Where saved places sit on the frame, as fractions of its size. Clear of the centre pin and the label. */
const SLOTS = [
  { x: 0.19, y: 0.3 },
  { x: 0.78, y: 0.24 },
  { x: 0.83, y: 0.66 },
  { x: 0.58, y: 0.84 },
  { x: 0.1, y: 0.58 },
  { x: 0.36, y: 0.14 },
  { x: 0.93, y: 0.42 },
  { x: 0.3, y: 0.62 },
];

/**
 * The alert zone is stylised rather than to scale: a true-to-scale 100 m ring
 * would disappear behind the pin. Bigger radius, bigger ring.
 */
function ringDiameter(meters: number) {
  return Math.round(Math.min(150, Math.max(48, 32 + meters * 0.236)));
}

/**
 * The stylised MockMap in a fixed-height frame, with Haven's place overlays:
 * an alert-zone ring, a place icon on the pin and markers for saved places.
 * The artwork is scaled to the frame's width and cropped, so it fills the frame at any size.
 */
export function PlaceMap({ height = 180, tint, label, pinIcon, radiusMeters, markers }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const color = tint ?? categoryColors.geofence;
  const artHeight = Math.max(height, width > 0 ? Math.round(width / ART_RATIO) : FALLBACK_ART_HEIGHT);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  return (
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      <View style={[styles.art, { height: artHeight, top: -(artHeight - height) / 2 }]}>
        <MockMap height={artHeight} pinColor={color} rounded={false} />
        {radiusMeters != null ? <Ring diameter={ringDiameter(radiusMeters)} color={color} /> : null}
        {pinIcon ? (
          // Same geometry as the MockMap pin, so this sits exactly on top of it.
          <View style={styles.pinWrap}>
            <View style={[styles.pin, { backgroundColor: color }]}>
              <MaterialCommunityIcons name={pinIcon as MciName} size={18} color="#FFFFFF" />
            </View>
            <View style={[styles.pinStem, { backgroundColor: color }]} />
          </View>
        ) : null}
      </View>

      {markers && markers.length > 0 ? (
        <View style={styles.overlay}>
          {markers.slice(0, SLOTS.length).map((marker, i) => (
            <View
              key={marker.id}
              style={[
                styles.marker,
                shadow(1),
                {
                  left: `${SLOTS[i].x * 100}%`,
                  top: `${SLOTS[i].y * 100}%`,
                  backgroundColor: colors.surface,
                  borderColor: color,
                },
              ]}>
              <MaterialCommunityIcons name={marker.icon as MciName} size={15} color={color} />
            </View>
          ))}
        </View>
      ) : null}

      {label ? (
        <View style={[styles.label, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="smallStrong">{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Ring({ diameter, color }: { diameter: number; color: string }) {
  const size = useAnimatedStyle(() => ({
    width: withTiming(diameter, { duration: 220 }),
    height: withTiming(diameter, { duration: 220 }),
  }));
  return (
    <View style={[styles.overlay, styles.center]}>
      <Animated.View style={[styles.ring, { borderColor: color, backgroundColor: color + '2E' }, size]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  art: { position: 'absolute', left: 0, right: 0 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' },
  center: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderRadius: radii.pill, borderWidth: 2 },
  pinWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  pinStem: { width: 3, height: 10, marginTop: -2, borderRadius: 2 },
  marker: {
    position: 'absolute',
    width: 30,
    height: 30,
    marginLeft: -15,
    marginTop: -15,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
