import { useState } from 'react';
import { Card, SegmentedControl, Text } from '@/components/ui';
import { saveThreshold, usePowerThreshold } from '@/sync/power';

const options = ['Off', '10%', '20%', '30%', '50%'];
export function PowerSetting({ family, child }: { family: string; child: string }) {
  const state = usePowerThreshold(family, child);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(value: string) {
    if (!options.includes(value) || busy) return;
    setBusy(true);
    setError('');
    try { await saveThreshold(family, child, parseInt(value, 10) || 0); }
    catch { setError('Unable to save the battery threshold.'); }
    finally { setBusy(false); }
  }
  return <Card><Text variant="title">Child phone power saving</Text>
    <Text>Pause automatic usage and foreground GPS updates below the selected battery level. Manual sharing stays available.</Text>
    {state?.percent != null && !busy
      ? <SegmentedControl accessibilityLabel="Battery threshold" options={options} value={state.percent ? state.percent + '%' : 'Off'} onChange={save} />
      : <Text>{state?.error ? 'Power settings unavailable.' : busy ? 'Saving…' : 'Loading…'}</Text>}
    {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
  </Card>;
}
