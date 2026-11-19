import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, Card, Header, Screen, Text } from '@/components/ui';
import { domainCounts, parseActivityImport, type ActivitySource, type ImportedActivity } from '@/sync/activityImport';
import { useTheme } from '@/theme';

export function ImportedActivityReport({ initialDomains, source, child }: { initialDomains?: boolean; source: ActivitySource; child: string }) {
  const { colors } = useTheme();
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<ImportedActivity[]>([]);
  const [error, setError] = useState('');
  const [domains, setDomains] = useState(initialDomains ?? false);
  const [search, setSearch] = useState('');
  const [days, setDays] = useState(0);
  const [now] = useState(Date.now);
  const [visible, setVisible] = useState(50);
  const model = source === 'chrome' ? 'Chrome Takeout Browser History JSON' : 'English YouTube Takeout watch-history JSON';
  const query = search.trim().toLowerCase();
  const cutoff = days ? now - days * 86400000 : 0;
  const filtered = entries.filter(entry => entry.at >= cutoff && [entry.host, entry.page, entry.title].some(value => value.toLowerCase().includes(query)));
  const counts = domains ? domainCounts(filtered) : [];

  function importActivity() {
    try {
      setEntries(parseActivityImport(input, source));
      setInput('');
      setError('');
      setVisible(50);
    } catch (failure) {
      setError(failure instanceof SyntaxError ? 'Paste valid JSON from the selected export.' : failure instanceof Error ? failure.message : 'Unable to load activity.');
    }
  }

  return <Screen>
    <Header back title={source === 'youtube' ? 'Video Watch History' : domains ? 'Web Activity' : 'Browsing History'} subtitle={child} />
    <Card><View style={{ gap: 10 }}>
      <Text>Paste {model} that you have permission to view. Up to 1,000 recent entries stay on this screen until you clear them or leave it.</Text>
      <Text>Coverage is limited to the supplied export. Browser query strings are omitted. Times are shown in this phone’s time zone.</Text>
      <TextInput accessibilityLabel="Authorized activity export JSON" placeholder="Paste export JSON" placeholderTextColor={colors.textFaint}
        maxLength={500001} multiline value={input} onChangeText={setInput} style={{ minHeight: 96, maxHeight: 160, color: colors.text }} />
      <Button label="Import for this session" disabled={!input.trim()} onPress={importActivity} />
      {error && <Text accessibilityLiveRegion="polite">{error}</Text>}
    </View></Card>
    {entries.length > 0 && <Card><View style={{ gap: 10 }}>
      <Text>{model} · {filtered.length} {filtered.length === 1 ? 'record' : 'records'}</Text>
      <TextInput accessibilityLabel="Search imported activity" placeholder="Search records" placeholderTextColor={colors.textFaint}
        value={search} onChangeText={setSearch} style={{ color: colors.text }} />
      <Button label={days ? 'Last ' + days + ' days · change' : 'All export dates · change'}
        onPress={() => setDays(days === 0 ? 7 : days === 7 ? 30 : 0)} variant="secondary" />
      {source === 'chrome' && <Button label={domains ? 'Show pages' : 'Show domains'} onPress={() => { setDomains(!domains); setVisible(50); }} variant="secondary" />}
      {domains ? counts.slice(0, visible).map(row => <Text key={row.host}>{row.host} · {row.count}</Text>) : filtered.slice(0, visible).map(row => (
        <View key={row.key} style={{ gap: 4 }}>
          {row.title && <Text>{row.title}</Text>}
          <Text variant="small" tone="muted">{row.page} · {new Date(row.at).toLocaleString()}</Text>
        </View>
      ))}
      {(domains ? counts.length : filtered.length) > visible && <Button label="Show more" onPress={() => setVisible(visible + 50)} variant="secondary" />}
      <Button label="Clear imported activity" onPress={() => { setEntries([]); setInput(''); setSearch(''); setError(''); setDays(0); }} variant="secondary" />
    </View></Card>}
  </Screen>;
}
