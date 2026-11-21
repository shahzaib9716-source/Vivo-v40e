import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Image } from 'react-native';
import { Button, Text } from '@/components/ui';
import { device } from '@/sync/androidDevice';

export function HavenScreenCapture({ onPick, disabled }: { onPick: (image: string) => void; disabled: boolean }) {
  const [images, setImages] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const inSession = useRef(false);
  const stop = useCallback(() => {
    generation.current++;
    inSession.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRunning(false);
  }, []);
  useFocusEffect(useCallback(() => {
    active.current = AppState.currentState === 'active';
    const clear = () => { stop(); setImages([]); setMessage(''); };
    const change = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (!active.current) clear();
    });
    const blur = AppState.addEventListener('blur', clear);
    return () => { active.current = false; change.remove(); blur.remove(); clear(); };
  }, [stop]));

  if (!device?.captureHavenWindow) return null;
  function start(count: number) {
    if (inSession.current || !active.current || disabled) return;
    const id = ++generation.current;
    setImages([]);
    setMessage(count === 1 ? 'Capturing this screen…' : 'Capturing this Haven screen every 5 seconds. You can scroll or stop.');
    setRunning(true);
    inSession.current = true;
    async function capture(index: number) {
      if (!active.current || generation.current !== id) return;
      try {
        const image = await device!.captureHavenWindow!();
        if (generation.current !== id || !active.current) return;
        setImages(items => [...items, image]);
        if (index < count) {
          setMessage('Captured ' + index + ' of ' + count + '. The next capture is in 5 seconds.');
          timer.current = setTimeout(() => { void capture(index + 1); }, 5000);
        } else {
          stop();
          setMessage('Choose a capture to review before sharing.');
        }
      } catch {
        if (id === generation.current) { stop(); setMessage('Could not capture the visible Haven screen. Try again.'); }
      }
    }
    if (count === 1) void capture(1);
    else timer.current = setTimeout(() => { void capture(1); }, 5000);
  }
  return <>
    {running ? <Button label="Stop screen captures" onPress={() => { stop(); setMessage('Capture stopped.'); }} /> : <>
      <Button label="Capture this Haven screen" disabled={disabled} onPress={() => start(1)} />
      <Button label="Take 3 Haven screenshots, 5 seconds apart" variant="secondary" disabled={disabled} onPress={() => start(3)} />
    </>}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    {!running && images.map((image, i) => <Button key={i} label={'Review capture ' + (i + 1)} disabled={disabled} onPress={() => onPick(image)} />)}
    {!running && images.length > 0 && <>
      <Image accessibilityLabel="Most recent private capture" resizeMode="contain" style={{ height: 150 }} source={{ uri: 'data:image/jpeg;base64,' + images[images.length - 1] }} />
      <Button label="Discard screen captures" variant="ghost" disabled={disabled} onPress={() => { setImages([]); setMessage(''); }} />
    </>}
  </>;
}
