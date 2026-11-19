import { Button, View } from 'react-native';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/sync/remote';
import { useEffect, useState } from 'react';
import { Card, Text } from '@/components/ui';
import { listenPolicy, policyCollection, listenUsage, type AppUsage, type PackageRule } from '@/sync/androidDevice';

import { listenManagement } from '@/sync/managementReport';
import type { UsageDay } from '@/sync/usageWeek';

export function DeviceReport({ family, child, manage = false }: { family: string; child: string; manage?: boolean }) {
  const [deviceStatus, setDeviceStatus] = useState('Waiting for device status…');
  useEffect(() => manage ? listenManagement(family, child, setDeviceStatus) : undefined, [manage, family, child]);
  const [days, setDays] = useState<UsageDay[]>([]);
  const [apps, setApps] = useState<AppUsage[]>([]);
  const [status, setStatus] = useState('Loading shared report…');
  useEffect(() => listenUsage(family, child, (items, at, screenMs, history) => {
    setDays(history);
    setApps(items);
    setStatus(at ? (screenMs == null ? '' : Math.floor(screenMs / 60000) + ' foreground min · ') + 'Measured on ' + new Date(at).toLocaleString() : 'No usage report shared yet.');
  }, () => { setDays([]); setApps([]); setStatus('Report unavailable. Check connectivity and family access.'); }), [family, child]);
  const [rules, setRules] = useState<PackageRule[]>([]);
  const [feedback, setFeedback] = useState('');
  useEffect(() => manage ? listenPolicy(family, child, setRules, e => setFeedback(e.message)) : undefined, [family, child, manage]);
  async function save(pkg: string, action: 'limit' | 'block' | 'remove') {
    try {
      const ref = doc(policyCollection(family, child), pkg);
      await runTransaction(db(), async tx => {
        const old = (await tx.get(ref)).data();
        if (action === 'remove') tx.delete(ref);
        else tx.set(ref, { minutes: action === 'limit' ? ((old?.minutes ?? 0) + 30) % 150 : old?.minutes ?? 0,
          blocked: action === 'block' ? !old?.blocked : old?.blocked ?? false });
      });
      setFeedback('Rule saved.');
    } catch { setFeedback('Could not save the rule. Check family access and retry.'); }
  }
  const rows = new Map(apps.map(a => [a.pkg, a]));
  if (manage) for (const r of rules) if (!rows.has(r.pkg)) rows.set(r.pkg, { pkg: r.pkg, ms: 0, label: r.pkg });
  return <Card><Text variant="title">Device usage</Text><Text>{status}</Text>
    {!manage && days.length > 0 && <View style={{ gap: 4 }}>
      <Text variant="title">7 days ending {days[days.length - 1].day}</Text>
      <Text>{Math.floor(days.reduce((sum, day) => sum + day.ms, 0) / 60000)} foreground min across {days.length} shared {days.length === 1 ? 'day' : 'days'}. Each day includes usage up to its last shared report.</Text>
      {days.map(day => <Text key={day.day}>{day.day} · {Math.floor(day.ms / 60000)} min</Text>)}
    </View>}
    {manage && <Text accessibilityLiveRegion="polite">{deviceStatus}</Text>}
    {manage && <Text>On device-owner phones, limits and pauses apply to enrolled, eligible apps. Android checks usage periodically. Open Haven on the child phone to receive changed rules.</Text>}
    {Array.from(rows.values()).map(a => {
      const rule = rules.find(r => r.pkg === a.pkg);
      return <View key={a.pkg} style={{ paddingVertical: 8, gap: 4 }}>
        <Text>{a.label} · {Math.floor(a.ms / 60000)} min{'\n'}{a.pkg}</Text>
        {manage && <>
          <Button title={rule?.blocked ? 'Allow app' : 'Block app'} onPress={() => save(a.pkg, 'block')} />
          <Button title={'Daily limit: ' + (rule?.minutes ? rule.minutes + ' min' : 'none') + ' · change'} onPress={() => save(a.pkg, 'limit')} />
          {rule && <Button title="Remove from managed apps" onPress={() => save(a.pkg, 'remove')} />}
        </>}
      </View>;
    })}
    <Text accessibilityLiveRegion="polite">{feedback}</Text>
  </Card>;
}
