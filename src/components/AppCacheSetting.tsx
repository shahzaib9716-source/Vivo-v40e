import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Button, Card, Text } from '@/components/ui';
import { device } from '@/sync/androidDevice';

export function AppCacheSetting() {
  const [bytes, setBytes] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useFocusEffect(useCallback(() => {
    let current = true;
    void device?.appCache?.(false).then(size => { if (current) setBytes(size.bytes); })
      .catch(() => { if (current) setMessage('Could not measure temporary files.'); });
    return () => { current = false; };
  }, []));
  if (!device?.appCache) return null;
  async function clear() {
    if (busy || !device?.appCache) return;
    setBusy(true);
    try {
      const result = await device.appCache(true);
      setBytes((await device.appCache(false)).bytes);
      setMessage(result.failures ? 'Some temporary files are in use. Try again after closing media previews.' : 'Temporary files cleared.');
    } catch { setMessage('Could not clear temporary files.'); }
    finally { setBusy(false); }
  }
  return <Card><Text variant="title">App cache</Text>
    <Text>Temporary files on this phone{bytes != null ? ' · ' + (bytes / 1048576).toFixed(2) + ' MB' : ''}</Text>
    <Button label="Clear cache" disabled={busy || bytes === 0} onPress={clear} />
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
  </Card>;
}
