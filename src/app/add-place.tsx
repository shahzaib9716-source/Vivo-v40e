import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { PlaceMap } from '@/components/PlaceMap';
import { Field, FormScreen, OptionTile, Pill, TextField, type FormHandle, type TextFieldRef } from '@/components/RuleForm';
import { Card, IconBadge, Row, SectionLabel, Text, Toggle } from '@/components/ui';
import { useStore } from '@/state/store';
import { categoryColors, radius as radii, spacing, useTheme } from '@/theme';

const NAME_MAX = 24;
const TINT = categoryColors.geofence;

/** MaterialCommunityIcons names, each checked against the glyph map. */
const ICONS = [
  { name: 'home', label: 'Home' },
  { name: 'school', label: 'School' },
  { name: 'account-heart', label: 'Family' },
  { name: 'soccer', label: 'Sports' },
  { name: 'basketball', label: 'Court' },
  { name: 'library', label: 'Library' },
  { name: 'hospital-box', label: 'Clinic' },
  { name: 'store', label: 'Shop' },
];

const RADII = [
  { meters: 100, fits: 'One building and its front door' },
  { meters: 150, fits: 'A home and the street outside' },
  { meters: 200, fits: 'A school and its playground' },
  { meters: 300, fits: 'A park or a couple of blocks' },
  { meters: 500, fits: 'A whole neighbourhood' },
];

/** Quick picks. Any that match a place the family already saved are left out. */
const IDEAS = [
  { name: 'Football practice', icon: 'soccer', meters: 300 },
  { name: 'Library', icon: 'library', meters: 100 },
  { name: 'Basketball court', icon: 'basketball', meters: 150 },
  { name: 'Aunt’s house', icon: 'account-heart', meters: 150 },
  { name: 'Corner shop', icon: 'store', meters: 100 },
];

function alertSummary(arrive: boolean, leave: boolean) {
  if (arrive && leave) return 'Arrive & leave';
  if (arrive) return 'Arrive only';
  if (leave) return 'Leave only';
  return 'No alerts';
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function AddPlace() {
  const { colors } = useTheme();
  const { places, addPlace, live } = useStore();

  const [coordinates, setCoordinates] = useState('');
  const pair = coordinates.split(',').map(part => part.trim());
  const [latitude, longitude] = pair.map(Number);
  const coordinateError = live && (pair.length !== 2 || pair.some(part => !/^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)$/.test(part)) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) ? 'Enter latitude and longitude, separated by a comma.' : null;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0].name);
  const [meters, setMeters] = useState(150);
  const [arrive, setArrive] = useState(true);
  const [leave, setLeave] = useState(true);
  const [tried, setTried] = useState(false);

  const form = useRef<FormHandle>(null);
  const nameInput = useRef<TextFieldRef>(null);
  const nameY = useRef(0);
  const saved = useRef(false);

  const cleanName = name.trim();
  const duplicate = places.find((p) => sameName(p.name, cleanName));
  const nameError = !cleanName
    ? 'Give this place a name.'
    : duplicate
      ? `You already have a place called “${duplicate.name}”.`
      : null;

  const ideas = IDEAS.filter((idea) => !places.some((p) => sameName(p.name, idea.name)));
  const fits = RADII.find((r) => r.meters === meters)?.fits;

  const save = () => {
    if (nameError) {
      setTried(true);
      form.current?.reveal(nameY.current);
      nameInput.current?.focus();
      return;
    }
    if (coordinateError) { setTried(true); return; }
    if (saved.current) return;
    saved.current = true;
    addPlace({ name: cleanName, icon, radius: meters, arrive, leave, ...(live ? { latitude, longitude } : {}) });
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else (router.replace as any)('/geofences');
  };

  return (
    <FormScreen
      ref={form}
      title="New place"
      subtitle={live ? 'Choose coordinates for arrival and departure alerts during foreground sharing.' : 'Get a heads-up when your child arrives or leaves'}
      saveLabel="Save place"
      onSave={save}
      error={tried ? nameError || coordinateError : null}
      lead={
        ideas.length > 0 ? (
          <View style={styles.lead}>
            <SectionLabel>Quick picks</SectionLabel>
            <View style={styles.wrapRow}>
              {ideas.map((idea) => (
                <Pill
                  key={idea.name}
                  label={idea.name}
                  icon={idea.icon}
                  iconFamily="mci"
                  color={TINT}
                  raised
                  active={name === idea.name && icon === idea.icon && meters === idea.meters}
                  onPress={() => {
                    setName(idea.name);
                    setIcon(idea.icon);
                    setMeters(idea.meters);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null
      }
      preview={
        <Card style={styles.preview}>
          <IconBadge name={icon} family="mci" color={TINT} size={46} />
          <View style={styles.flex}>
            <Text variant="title" tone={cleanName ? 'default' : 'faint'} numberOfLines={1}>
              {cleanName || 'Place name'}
            </Text>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {meters} m · {alertSummary(arrive, leave)}
            </Text>
          </View>
          <View style={[styles.previewTag, { backgroundColor: colors.surfaceSunken }]}>
            <Text variant="tiny" tone="muted">
              PREVIEW
            </Text>
          </View>
        </Card>
      }>
      <Field
        label="Name"
        hint={`${name.length}/${NAME_MAX}`}
        error={tried ? nameError : null}
        onLayout={(e) => {
          nameY.current = e.nativeEvent.layout.y;
        }}>
        <TextField
          ref={nameInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Football practice"
          maxLength={NAME_MAX}
          invalid={tried && !!nameError}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Place name"
        />
      </Field>

      {live && <Field label="Place coordinates" error={tried ? coordinateError : null}><TextField value={coordinates} onChangeText={setCoordinates} accessibilityLabel="Latitude and longitude" placeholder="e.g. 37.42, -122.08" /></Field>}
      <Field label="Icon">
        <Card>
          <View style={styles.tileRows}>
            {[ICONS.slice(0, 4), ICONS.slice(4)].map((row, r) => (
              <View key={r} style={styles.tileRow}>
                {row.map((i) => (
                  <OptionTile
                    key={i.name}
                    icon={i.name}
                    family="mci"
                    label={i.label}
                    accessibilityLabel={`${i.label} icon`}
                    selected={icon === i.name}
                    color={TINT}
                    onPress={() => setIcon(i.name)}
                  />
                ))}
              </View>
            ))}
          </View>
        </Card>
      </Field>

      <Field label="Alert zone" hint={`${meters} m radius`}>
        <Card>
          {!live && <View style={[styles.map, { borderColor: colors.border }]}>
            <PlaceMap height={176} tint={TINT} pinIcon={icon} radiusMeters={meters} label={cleanName || 'New place'} />
          </View>}

          <View style={styles.radiusRow}>
            {RADII.map((r) => (
              <Pill
                key={r.meters}
                label={`${r.meters} m`}
                accessibilityLabel={`${r.meters} metre radius`}
                color={TINT}
                grow
                active={meters === r.meters}
                onPress={() => setMeters(r.meters)}
              />
            ))}
          </View>

          <View style={styles.caption}>
            <Feather name="target" size={14} color={TINT} style={styles.captionIcon} />
            <Text variant="small" tone="muted" style={styles.flex}>
              <Text variant="smallStrong">{meters} m radius.</Text> {fits ? `${fits}.` : ''}{' '}
              {live ? 'In-app alerts use fixes shared while the child keeps Me open.' : 'Alerts fire when your child crosses the edge of the zone.'}
            </Text>
          </View>
          {!live && <Text variant="tiny" tone="faint" style={styles.demoNote}>
            Sample map. In this demo the place is pinned to the middle of the map.
          </Text>}
        </Card>
      </Field>

      <Field label="Alerts">
        <Card padded={false} style={styles.alerts}>
          <Row
            title="Alert on arrival"
            subtitle="When your child enters the zone"
            icon="log-in"
            iconColor={colors.success}
            chevron={false}
            right={<Toggle value={arrive} onChange={setArrive} />}
          />
          <Row
            title="Alert on departure"
            subtitle="When your child leaves the zone"
            icon="log-out"
            iconColor={colors.accent}
            chevron={false}
            right={<Toggle value={leave} onChange={setLeave} />}
          />
        </Card>
        {!arrive && !leave ? (
          <View style={styles.quiet}>
            <Feather name="bell-off" size={14} color={colors.textFaint} style={styles.captionIcon} />
            <Text variant="small" tone="faint" style={styles.flex}>
              With both alerts off, this place is saved quietly. You can switch alerts on later.
            </Text>
          </View>
        ) : null}
      </Field>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lead: { marginBottom: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill },

  tileRows: { gap: spacing.sm },
  tileRow: { flexDirection: 'row', gap: spacing.sm },

  map: { borderRadius: radii.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  radiusRow: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  caption: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  captionIcon: { marginTop: 2 },
  demoNote: { marginTop: spacing.sm },

  alerts: { paddingHorizontal: spacing.lg },
  quiet: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, marginLeft: spacing.xs },
});
