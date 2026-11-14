import { StyleProp, ViewStyle } from 'react-native';

import { InlineNote } from '@/components/InlineNote';
import { useStore } from '@/state/store';
import { spacing } from '@/theme';

/**
 * What this version of Haven really does in a family, said where it matters.
 *
 * In a linked family the rules, requests, check-ins, messages, tasks and SOS are real: they travel
 * between the phones. The app does not read a phone's location, measure screen time or app use, or
 * lock anything on the phone: it has no code that asks the system for those. The numbers and maps
 * that would come from such readings are examples, and these notes say so on the screens that show
 * them. Outside a family (sample mode) everything is sample data and the notes stay away.
 */
type Topic = 'location' | 'usage' | 'rules';

const TEXT: Record<Topic, { title: string; detail: string }> = {
  location: {
    title: 'Example map and places',
    detail:
      'This version of Haven does not read where a phone is. The map, routes and “arrived / left” times here are examples. Check-ins and SOS from your child are real.',
  },
  usage: {
    title: 'Example usage numbers',
    detail:
      'This version of Haven does not measure screen time or app use, and does not read which apps are on a phone: the apps and usage shown here are examples. The limits you set are real and appear on your child’s phone.',
  },
  rules: {
    title: 'Rules are agreements',
    detail:
      'What you set here appears on your child’s phone straight away. This version of Haven does not lock the phone, block apps or filter the web by itself.',
  },
};

export function SampleNote({ about, style }: { about: Topic; style?: StyleProp<ViewStyle> }) {
  const { live } = useStore();
  if (!live) return null;
  const text = TEXT[about];
  return <InlineNote tone="neutral" icon="info" title={text.title} detail={text.detail} style={[{ marginBottom: spacing.lg }, style]} />;
}
