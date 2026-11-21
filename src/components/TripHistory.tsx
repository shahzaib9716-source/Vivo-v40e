import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Button, Card, Text } from '@/components/ui';
import { listenTripPoints, type TripPoint } from '@/sync/location';
import { useTheme } from '@/theme';

const timeOf = (p: TripPoint) => p.measuredAt ?? p.receivedAt;
const dateOf = (p: TripPoint) => new Date(timeOf(p)).toDateString();

function routeCoordinates(points: TripPoint[]) {
  const start = points[0];
  const scale = Math.max(0.001, Math.cos(start.latitude * Math.PI / 180));
  const coords = points.map(p => ({
    x: (((p.longitude - start.longitude + 540) % 360) - 180) * scale,
    y: start.latitude - p.latitude,
  }));
  const xs = coords.map(p => p.x);
  const ys = coords.map(p => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  const zoom = Math.min(292 / Math.max(width, 0.00001), 150 / Math.max(height, 0.00001));
  return coords.map(p => ({ x: 160 + (p.x - x - width / 2) * zoom, y: 90 + (p.y - y - height / 2) * zoom }));
}

export function TripHistory({ family, child }: { family: string; child: string }) {
  const { colors } = useTheme();
  const [points, setPoints] = useState<TripPoint[]>([]);
  const [message, setMessage] = useState('Loading trip history…');
  const [date, setDate] = useState('');
  const [chosen, setChosen] = useState<number>();
  useEffect(() => listenTripPoints(family, child, (rows, cached) => {
    setPoints(rows);
    setMessage(cached ? 'Showing cached trip history.' : rows.length ? '' : 'No trips shared yet.');
  }, () => { setPoints([]); setMessage('Unable to load trip history.'); }), [family, child]);
  const days = [...new Set(points.map(dateOf))];
  const displayed = days.includes(date) ? date : days[days.length - 1];
  const dayIndex = days.indexOf(displayed);
  const daily = points.filter(p => dateOf(p) === displayed);
  const selected = Math.max(0, chosen != null && chosen < daily.length ? chosen : daily.length - 1);
  const point = daily[selected];
  const coords = daily.length ? routeCoordinates(daily) : [];
  const tracks = new Map<string, string[]>();
  daily.forEach((p, i) => {
    const track = tracks.get(p.session) ?? [];
    track.push(coords[i].x + ',' + coords[i].y);
    tracks.set(p.session, track);
  });
  function changeDay(offset: number) {
    setDate(days[dayIndex + offset]);
    setChosen(undefined);
  }
  return <Card>
    <Text variant="title">Shared trips</Text>
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    {point && <>
      <Text>{displayed} · {daily.length} recorded {daily.length === 1 ? 'point' : 'points'}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Earlier day" size="sm" variant="secondary" disabled={dayIndex < 1} onPress={() => changeDay(-1)} />
        <Button label="Later day" size="sm" variant="secondary" disabled={dayIndex >= days.length - 1} onPress={() => changeDay(1)} />
      </View>
      <Svg width="100%" height={180} viewBox="0 0 320 180" accessibilityLabel="Recorded route, north up">
        {[...tracks].map(([key, line]) => <Polyline key={key} points={line.join(' ')} fill="none" stroke={colors.primary} strokeWidth={3} />)}
        {coords.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={i === selected ? 5 : 2} fill={i === selected ? colors.accent : colors.primary} onPress={() => setChosen(i)} />)}
      </Svg>
      <Text>{new Date(timeOf(point)).toLocaleTimeString()} · {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)} · ±{Math.round(point.accuracyM)} m</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Previous point" size="sm" variant="secondary" disabled={!selected} onPress={() => setChosen(selected - 1)} />
        <Button label="Next point" size="sm" variant="secondary" disabled={selected >= daily.length - 1} onPress={() => setChosen(selected + 1)} />
      </View>
      <Button label="Open point in Google Maps" variant="ghost" onPress={() => {
        void Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(point.latitude + ',' + point.longitude))
          .catch(() => setMessage('Could not open Maps. The coordinates are shown below the route.'));
      }} />
    </>}
  </Card>;
}
