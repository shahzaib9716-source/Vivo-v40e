import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Field, FormScreen, OptionTile, Pill, TextField, type FormHandle, type TextFieldRef } from '@/components/RuleForm';
import {
  DAY_LETTERS,
  DAY_NAMES,
  EVERY_DAY,
  ScheduleFace,
  WEEKDAYS,
  WEEKENDS,
  clockLabel,
  daysLabel,
  sameDays,
  spanMinutes,
} from '@/components/ScheduleFace';
import { Card, Divider, Row, SectionLabel, SegmentedControl, Text, Toggle } from '@/components/ui';
import { fmtDuration, useStore } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';

type FeatherName = keyof typeof Feather.glyphMap;

const NAME_MAX = 28;

const ICONS: { name: FeatherName; label: string }[] = [
  { name: 'moon', label: 'Moon' },
  { name: 'book', label: 'Book' },
  { name: 'edit-3', label: 'Pencil' },
  { name: 'coffee', label: 'Cup' },
  { name: 'sun', label: 'Sun' },
  { name: 'tv', label: 'Screen' },
  { name: 'music', label: 'Music' },
  { name: 'heart', label: 'Heart' },
];

const COLORS = [
  { hex: '#5B51E0', label: 'Indigo' },
  { hex: '#2E8BFF', label: 'Blue' },
  { hex: '#12B5A6', label: 'Teal' },
  { hex: '#FF7A59', label: 'Coral' },
  { hex: '#EC4899', label: 'Pink' },
  { hex: '#8B5CF6', label: 'Violet' },
];

const HOUR_ROWS = [
  [1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12],
];
const MINUTES = [0, 15, 30, 45];

interface Template {
  name: string;
  icon: FeatherName;
  color: string;
  start: number; // minutes since midnight
  end: number;
  days: readonly boolean[];
}

const TEMPLATES: Template[] = [
  { name: 'Bedtime', icon: 'moon', color: '#5B51E0', start: 21 * 60, end: 7 * 60, days: EVERY_DAY },
  { name: 'School day', icon: 'book', color: '#2E8BFF', start: 8 * 60 + 30, end: 15 * 60, days: WEEKDAYS },
  { name: 'Homework', icon: 'edit-3', color: '#12B5A6', start: 16 * 60, end: 17 * 60 + 30, days: WEEKDAYS },
  { name: 'Family dinner', icon: 'coffee', color: '#FF7A59', start: 18 * 60, end: 19 * 60, days: EVERY_DAY },
  { name: 'Slow morning', icon: 'sun', color: '#EC4899', start: 7 * 60, end: 9 * 60, days: WEEKENDS },
];

const DAY_SHORTCUTS = [
  { label: 'Every day', days: EVERY_DAY },
  { label: 'Weekdays', days: WEEKDAYS },
  { label: 'Weekends', days: WEEKENDS },
];

type Edge = 'start' | 'end';
type FieldKey = 'name' | 'time' | 'days';

export default function AddSchedule() {
  const { colors } = useTheme();
  const { addSchedule } = useStore();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<FeatherName>('moon');
  const [color, setColor] = useState(COLORS[0].hex);
  const [start, setStart] = useState(21 * 60);
  const [end, setEnd] = useState(7 * 60);
  const [days, setDays] = useState<boolean[]>([...EVERY_DAY]);
  const [on, setOn] = useState(true);
  const [editing, setEditing] = useState<Edge>('start');
  const [tried, setTried] = useState(false);

  const form = useRef<FormHandle>(null);
  const nameInput = useRef<TextFieldRef>(null);
  const fieldY = useRef<Record<FieldKey, number>>({ name: 0, time: 0, days: 0 });
  const saved = useRef(false);

  const cleanName = name.trim();
  const nameError = cleanName ? null : 'Give this schedule a name.';
  const timeError = start === end ? 'Start and end can’t be the same time.' : null;
  const daysError = days.some(Boolean) ? null : 'Pick at least one day.';
  const firstError = nameError ?? timeError ?? daysError;

  const length = spanMinutes(start, end);
  const overnight = end < start;

  // The time being edited, split into 12-hour parts.
  const value = editing === 'start' ? start : end;
  const setValue = editing === 'start' ? setStart : setEnd;
  const hour24 = Math.floor(value / 60);
  const minute = value % 60;
  const isPm = hour24 >= 12;
  const hour12 = hour24 % 12 || 12;

  const pickHour = (h: number) => setValue(((h % 12) + (isPm ? 12 : 0)) * 60 + minute);
  const pickMinute = (m: number) => setValue(hour24 * 60 + m);
  const pickPeriod = (period: string) => setValue(((hour24 % 12) + (period === 'PM' ? 12 : 0)) * 60 + minute);

  const toggleDay = (index: number) => setDays((prev) => prev.map((d, i) => (i === index ? !d : d)));

  const matches = (t: Template) =>
    name === t.name && icon === t.icon && color === t.color && start === t.start && end === t.end && sameDays(days, t.days);

  const applyTemplate = (t: Template) => {
    setName(t.name);
    setIcon(t.icon);
    setColor(t.color);
    setStart(t.start);
    setEnd(t.end);
    setDays([...t.days]);
    setEditing('start');
  };

  const save = () => {
    if (firstError) {
      setTried(true);
      const key: FieldKey = nameError ? 'name' : timeError ? 'time' : 'days';
      form.current?.reveal(fieldY.current[key]);
      if (key === 'name') nameInput.current?.focus();
      return;
    }
    if (saved.current) return;
    saved.current = true;
    addSchedule({ name: cleanName, icon, color, start: clockLabel(start), end: clockLabel(end), days: [...days], on });
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else (router.replace as any)('/schedules');
  };

  return (
    <FormScreen
      ref={form}
      title="New schedule"
      subtitle="Choose when the device winds down"
      saveLabel="Save schedule"
      onSave={save}
      error={tried ? firstError : null}
      lead={
        <View style={styles.lead}>
          <SectionLabel>Start from a template</SectionLabel>
          <View style={styles.wrapRow}>
            {TEMPLATES.map((t) => (
              <Pill key={t.name} label={t.name} icon={t.icon} color={t.color} active={matches(t)} raised onPress={() => applyTemplate(t)} />
            ))}
          </View>
        </View>
      }
      preview={
        <Card>
          <ScheduleFace
            name={cleanName}
            icon={icon}
            color={color}
            start={clockLabel(start)}
            end={clockLabel(end)}
            days={days}
            on={on}
            right={
              <View style={[styles.previewTag, { backgroundColor: colors.surfaceSunken }]}>
                <Text variant="tiny" tone="muted">
                  PREVIEW
                </Text>
              </View>
            }
          />
        </Card>
      }>
      <Field
        label="Name"
        hint={`${name.length}/${NAME_MAX}`}
        error={tried ? nameError : null}
        onLayout={(e) => {
          fieldY.current.name = e.nativeEvent.layout.y;
        }}>
        <TextField
          ref={nameInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Bedtime"
          maxLength={NAME_MAX}
          invalid={tried && !!nameError}
          autoCapitalize="sentences"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Schedule name"
        />
      </Field>

      <Field label="Icon and colour">
        <Card>
          <View style={styles.tileRows}>
            {[ICONS.slice(0, 4), ICONS.slice(4)].map((row, r) => (
              <View key={r} style={styles.tileRow}>
                {row.map((i) => (
                  <OptionTile
                    key={i.name}
                    icon={i.name}
                    accessibilityLabel={`${i.label} icon`}
                    selected={icon === i.name}
                    color={color}
                    onPress={() => setIcon(i.name)}
                  />
                ))}
              </View>
            ))}
          </View>
          <View style={styles.divider}>
            <Divider />
          </View>
          <View style={styles.swatches}>
            {COLORS.map((c) => {
              const selected = color === c.hex;
              return (
                <Pressable
                  key={c.hex}
                  onPress={() => setColor(c.hex)}
                  hitSlop={4}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={`${c.label} colour`}
                  style={({ pressed }) => [styles.swatch, { borderColor: selected ? c.hex : 'transparent' }, pressed && styles.pressed]}>
                  <View style={[styles.swatchFill, { backgroundColor: c.hex }]}>
                    {selected ? <Feather name="check" size={16} color="#FFFFFF" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </Field>

      <Field
        label="Time"
        hint={length > 0 ? fmtDuration(length) : undefined}
        error={timeError}
        onLayout={(e) => {
          fieldY.current.time = e.nativeEvent.layout.y;
        }}>
        <Card>
          <View style={styles.edges}>
            <EdgeTile caption="Starts" value={clockLabel(start)} active={editing === 'start'} color={color} onPress={() => setEditing('start')} />
            <Feather name="arrow-right" size={16} color={colors.textFaint} />
            <EdgeTile caption="Ends" value={clockLabel(end)} active={editing === 'end'} color={color} onPress={() => setEditing('end')} />
          </View>

          <Text variant="tiny" tone="faint" style={styles.pickerLabel}>
            {editing === 'start' ? 'START HOUR' : 'END HOUR'}
          </Text>
          <View style={styles.hourRows}>
            {HOUR_ROWS.map((row) => (
              <View key={row[0]} style={styles.chipRow}>
                {row.map((h) => (
                  <TimeChip
                    key={h}
                    label={String(h)}
                    accessibilityLabel={`${h} o’clock`}
                    selected={hour12 === h}
                    color={color}
                    onPress={() => pickHour(h)}
                  />
                ))}
              </View>
            ))}
          </View>

          <Text variant="tiny" tone="faint" style={styles.pickerLabel}>
            MINUTES
          </Text>
          <View style={styles.chipRow}>
            {MINUTES.map((m) => (
              <TimeChip
                key={m}
                label={`:${String(m).padStart(2, '0')}`}
                accessibilityLabel={`${m} minutes past`}
                selected={minute === m}
                color={color}
                onPress={() => pickMinute(m)}
              />
            ))}
          </View>

          <View style={styles.period}>
            <SegmentedControl options={['AM', 'PM']} value={isPm ? 'PM' : 'AM'} onChange={pickPeriod} />
          </View>

          {length > 0 ? (
            <View style={styles.caption}>
              <Feather name={overnight ? 'moon' : 'clock'} size={14} color={colors.textMuted} />
              <Text variant="small" tone="muted" style={styles.flex}>
                Runs for {fmtDuration(length)}
                {overnight ? ' and ends the next morning' : ''}
              </Text>
            </View>
          ) : null}
        </Card>
      </Field>

      <Field
        label="Repeats on"
        hint={daysLabel(days)}
        error={tried ? daysError : null}
        onLayout={(e) => {
          fieldY.current.days = e.nativeEvent.layout.y;
        }}>
        <Card>
          <View style={styles.dayRow}>
            {DAY_LETTERS.map((letter, i) => {
              const picked = days[i];
              return (
                <Pressable
                  key={i}
                  onPress={() => toggleDay(i)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: picked }}
                  accessibilityLabel={DAY_NAMES[i]}
                  style={({ pressed }) => [
                    styles.dayBtn,
                    { backgroundColor: picked ? color : colors.surfaceSunken },
                    pressed && styles.pressed,
                  ]}>
                  <Text variant="smallStrong" color={picked ? '#FFFFFF' : colors.textMuted}>
                    {letter}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.wrapRow, { marginTop: spacing.md }]}>
            {DAY_SHORTCUTS.map((s) => (
              <Pill key={s.label} label={s.label} color={color} active={sameDays(days, s.days)} onPress={() => setDays([...s.days])} />
            ))}
          </View>
        </Card>
      </Field>

      <Card padded={false} style={styles.switchCard}>
        <Row
          title="Turn on right away"
          subtitle={on ? 'Applies as soon as you save' : 'Saved switched off until you need it'}
          icon="power"
          iconColor={color}
          chevron={false}
          right={<Toggle value={on} onChange={setOn} />}
        />
      </Card>
    </FormScreen>
  );
}

/** One end of the time window. Tap to choose which end the picker below edits. */
function EdgeTile({ caption, value, active, color, onPress }: { caption: string; value: string; active: boolean; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${caption} ${value}`}
      style={({ pressed }) => [
        styles.edge,
        { backgroundColor: active ? color + '1F' : colors.surfaceAlt, borderColor: active ? color : colors.border },
        pressed && styles.pressed,
      ]}>
      <View style={styles.edgeHead}>
        <Text variant="tiny" tone={active ? 'default' : 'faint'}>
          {caption.toUpperCase()}
        </Text>
        {active ? <Feather name="edit-2" size={12} color={colors.textMuted} /> : null}
      </View>
      <Text variant="h3">{value}</Text>
    </Pressable>
  );
}

function TimeChip({ label, accessibilityLabel, selected, color, onPress }: { label: string; accessibilityLabel: string; selected: boolean; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.timeChip,
        { backgroundColor: selected ? color + '22' : colors.surfaceAlt, borderColor: selected ? color : colors.border },
        pressed && styles.pressed,
      ]}>
      <Text variant="bodyStrong" tone={selected ? 'default' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  lead: { marginBottom: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  previewTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },

  tileRows: { gap: spacing.sm },
  tileRow: { flexDirection: 'row', gap: spacing.sm },
  divider: { marginVertical: spacing.md },
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { width: 42, height: 42, borderRadius: radius.pill, borderWidth: 2, padding: 3 },
  swatchFill: { flex: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },

  edges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  edge: { flex: 1, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, gap: 2 },
  edgeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: 2 },
  hourRows: { gap: 6 },
  chipRow: { flexDirection: 'row', gap: 6 },
  timeChip: { flex: 1, height: 44, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  period: { marginTop: spacing.md },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },

  dayRow: { flexDirection: 'row', gap: 6 },
  dayBtn: { flex: 1, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },

  switchCard: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
});
