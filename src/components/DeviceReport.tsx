import { useEffect, useState } from 'react';
import { Card, Text } from '@/components/ui';
import { listenUsage, type AppUsage } from '@/sync/device';

export function DeviceReport({ family, child }: { family: string; child: string }) {
  const [apps, setApps] = useState<AppUsage[]>([]);
  const [status, setStatus] = useState('Loading shared report…');
  useEffect(() => listenUsage(family, child, (items, at) => {
    setApps(items);
    setStatus(at ? 'Measured on ' + new Date(at).toLocaleString() : 'No usage report shared yet.');
  }, () => { setApps([]); setStatus('Report unavailable. Check connectivity and family access.'); }), [family, child]);
  return <Card><Text variant="title">Device usage</Text><Text>{status}</Text>
    {apps.map(a => <Text key={a.pkg}>{a.label} · {Math.floor(a.ms / 60000)} min{'\n'}{a.pkg}</Text>)}
  </Card>;
}
