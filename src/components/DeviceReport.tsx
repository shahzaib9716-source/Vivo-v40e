import { Button, TextInput, View } from 'react-native';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/sync/remote';
import { useEffect, useState } from 'react';
import { BarChart, Card, SegmentedControl, Text } from '@/components/ui';
import { listenPolicy, policyCollection, listenUsage, type AppUsage, type PackageRule } from '@/sync/androidDevice';

import { listenManagement } from '@/sync/managementReport';
import { rankAppActivity, type AppActivityFilter } from '@/sync/appActivity';
import { useTheme } from '@/theme';
import type { UsageDay } from '@/sync/usageWeek';

export function DeviceReport({ family, child, manage = false, view = 'all' }: { family: string; child: string; manage?: boolean; view?: AppActivityFilter | 'summary' }) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('Day');
  const weekly = !manage && range === 'Week';
  const [hasReport, setHasReport] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState('Waiting for device status…');
  useEffect(() => manage ? listenManagement(family, child, setDeviceStatus) : undefined, [manage, family, child]);
  const [days, setDays] = useState<UsageDay[]>([]);
  const [apps, setApps] = useState<AppUsage[]>([]);
  const [status, setStatus] = useState('Loading shared report…');
  useEffect(() => listenUsage(family, child, (items, at, screenMs, history) => {
    setHasReport(at > 0);
    setDays(history);
    setApps(items);
    setStatus(at ? (screenMs == null ? '' : Math.floor(screenMs / 60000) + ' device foreground min · ') + 'Measured on ' + new Date(at).toLocaleString() : 'No usage report shared yet.');
  }, () => { setHasReport(false); setDays([]); setApps([]); setStatus('Report unavailable. Check connectivity and family access.'); }), [family, child]);
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
  const ranked = view === 'summary' ? [] : rankAppActivity(apps, view, search, weekly);
  const rows = new Map(ranked.map(a => [a.pkg, a]));
  if (manage) for (const r of rules) if (!rows.has(r.pkg)) rows.set(r.pkg, { pkg: r.pkg, ms: 0, label: r.pkg });
  return <Card><Text variant="title">Device usage</Text><Text>{status}</Text>
    {!manage && (view === 'all' || view === 'summary') && days.length > 0 && <View style={{ gap: 4 }}>
      <Text variant="title">7 days ending {days[days.length - 1].day}</Text>
      <Text>{Math.floor(days.reduce((sum, day) => sum + day.ms, 0) / 60000)} foreground min across {days.length} shared {days.length === 1 ? 'day' : 'days'}. Totals include available foreground events. Days without recorded usage may be missing.</Text>
      <BarChart data={days.map(day => ({ label: day.day.slice(5), value: day.ms / 60000 }))} />
      {days.map(day => <Text key={day.day}>{day.day} · {Math.floor(day.ms / 60000)} min</Text>)}
    </View>}
    {manage && <Text accessibilityLiveRegion="polite">{deviceStatus}</Text>}
    {manage && <Text>On device-owner phones, limits and pauses apply to enrolled, eligible apps. Android checks usage periodically. Open Haven on the child phone to receive changed rules.</Text>}
    {hasReport && !manage && view !== 'summary' && <View style={{ gap: 6 }}>
      <Text>{view === 'all' ? 'Visible launchable apps' : 'Recognized apps'} · {weekly ? 'Observed foreground usage across seven child-local days' : 'Foreground usage on the report day'}</Text>
      <SegmentedControl options={['Day', 'Week']} value={range} onChange={setRange} accessibilityLabel="App usage range" />
      <TextInput accessibilityLabel="Search apps" placeholder="Search apps or packages" placeholderTextColor={colors.textFaint}
        value={search} onChangeText={setSearch} style={{ color: colors.text, paddingVertical: 8 }} />
      {rows.size === 0 && <Text>{search.trim() ? 'No apps match this search.' : weekly ? 'No weekly usage observations for these apps.' : 'No matching apps in this report.'}</Text>}
    </View>}
    {Array.from(rows.values()).map(a => {
      const rule = rules.find(r => r.pkg === a.pkg);
      return <View key={a.pkg} style={{ paddingVertical: 8, gap: 4 }}>
        <Text>{a.label} · {Math.floor((weekly ? (a.weeklyMs ?? 0) : a.ms) / 60000)} min{'\n'}{a.pkg}</Text>
        {a.lastUsedAt && !manage ? <Text variant="small" tone="muted">Last observed {new Date(a.lastUsedAt).toLocaleString()}</Text> : null}
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
