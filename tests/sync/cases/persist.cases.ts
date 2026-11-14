/** The saved-state loader: the new optional fields, older saves, and the link layer's record. */
import { loadState, serialiseState, STATE_VERSION, type PersistedState } from '@/state/persist';
import type { Case } from '../support/assert';
import { alert, child, message, place, request, schedule, site, task } from '../support/fixtures';

const SEED: PersistedState = {
  children: [child('c1'), child('c2')],
  activeChildId: 'c1',
  requests: [request('r1', 'c1', { at: undefined })],
  alerts: [alert('n1', { at: undefined, kind: undefined, childId: undefined })],
  places: [place('p1')],
  tasks: [task('t1')],
  schedules: [schedule('s1')],
  messages: [message('m1', 'c1', 'parent', { at: undefined })],
  sites: [site('w1')],
  sosActive: false,
  sosChildId: null,
};

const state = (over: Partial<PersistedState> = {}): PersistedState => ({ ...SEED, ...over });
const raw = (slices: Record<string, unknown>, extra: Record<string, unknown> = {}) => JSON.stringify({ v: STATE_VERSION, state: slices, ...extra });
/** A save as the first release wrote it: no sosChildId, no `at`, no `kind`. */
const oldSave = () => {
  const { sosChildId: _dropped, ...slices } = JSON.parse(JSON.stringify(SEED)) as PersistedState;
  return slices;
};

export const cases: Case[] = [
  {
    name: 'load: a save from before these fields existed loads completely',
    run(t) {
      const result = loadState(raw(oldSave()), SEED);
      t.equal(result.source, 'stored');
      t.deepEqual(result.fallbacks, []);
      t.equal(result.state.sosChildId, null);
      t.deepEqual(result.state.requests, JSON.parse(JSON.stringify(SEED.requests)));
      t.ok(!('sync' in result));
    },
  },
  {
    name: 'load: the new optional fields are kept when present and well formed',
    run(t) {
      const saved = state({
        children: [child('c1', { checkInAt: 1_700_000_000_000 })],
        requests: [request('r1', 'c1', { at: 5 })],
        alerts: [alert('n1', { at: 6, kind: 'sos', childId: 'c1' }), alert('n2', { at: 7, kind: 'note', childId: null })],
        messages: [message('m1', 'c1', 'child', { at: 8 })],
        sosActive: true,
        sosChildId: 'c1',
      });
      const result = loadState(serialiseState(saved), SEED);
      t.equal(result.source, 'stored');
      t.deepEqual(result.state, JSON.parse(JSON.stringify(saved)));
    },
  },
  {
    name: 'load: a present field of the wrong type still sends its slice back to the seed',
    run(t) {
      const bad = (slices: Record<string, unknown>) => loadState(raw({ ...oldSave(), ...slices }), SEED).fallbacks;
      t.deepEqual(bad({ requests: [{ ...request('r1', 'c1'), at: 'yesterday' }] }), ['requests']);
      t.deepEqual(bad({ alerts: [{ ...alert('n1'), kind: 7 }] }), ['alerts']);
      t.deepEqual(bad({ alerts: [{ ...alert('n1'), childId: 7 }] }), ['alerts']);
      t.deepEqual(bad({ messages: [{ ...message('m1', 'c1', 'child'), at: -1 }] }), ['messages']);
      t.deepEqual(bad({ children: [{ ...child('c1'), checkInAt: null }] }), ['children']);
      t.deepEqual(bad({ sosChildId: 7 }), ['sosChildId']);
      t.deepEqual(bad({ sosChildId: '' }), ['sosChildId']);
    },
  },
  {
    name: 'load: nothing usable at all is still "the seed", with or without the optional slice',
    run(t) {
      const empty = loadState(raw({}), SEED);
      t.equal(empty.source, 'seed');
      t.equal(empty.state, SEED);
      const onlyOptional = loadState(raw({ sosChildId: 'c1' }), SEED);
      t.equal(onlyOptional.source, 'seed');
      t.equal(loadState(null, SEED).reason, 'empty');
      t.equal(loadState('{', SEED).reason, 'corrupt');
      t.equal(loadState(JSON.stringify({ v: 99, state: oldSave() }), SEED).reason, 'version');
    },
  },
  {
    name: 'load: on its own a device never has an empty children list; a linked one may',
    run(t) {
      const alone = loadState(raw({ ...oldSave(), children: [] }), SEED);
      t.deepEqual(alone.fallbacks, ['children']);
      t.equal(alone.state.children, SEED.children);
      const linked = loadState(raw({ ...oldSave(), children: [] }, { sync: { familyId: 'F' } }), SEED);
      t.deepEqual(linked.fallbacks, []);
      t.deepEqual(linked.state.children, []);
      t.equal(linked.state.activeChildId, 'c1', 'the choice is kept for when children arrive');
    },
  },
  {
    name: 'record: the link layer\'s record is written with the state and comes back as it was',
    run(t) {
      const record = { familyId: 'F', adopt: true, confirmed: { places: [place('p1')] } };
      const json = serialiseState(state(), record);
      t.deepEqual(Object.keys(JSON.parse(json)), ['v', 'state', 'sync'], 'one value, so one write');
      const result = loadState(json, SEED);
      t.deepEqual(result.sync, record);
      t.equal(result.source, 'stored');
      // No record: the stored string is exactly what it always was.
      t.deepEqual(Object.keys(JSON.parse(serialiseState(state()))), ['v', 'state']);
      t.deepEqual(Object.keys(JSON.parse(serialiseState(state(), null))), ['v', 'state']);
      // A slice that fell back is reported next to the record, so the link layer can distrust it.
      const partial = loadState(raw({ ...oldSave(), places: 'broken' }, { sync: record }), SEED);
      t.deepEqual(partial.fallbacks, ['places']);
      t.deepEqual(partial.sync, record);
      // A save that is unreadable as a whole carries no record: there is nothing it could describe.
      t.ok(!('sync' in loadState(JSON.stringify({ v: 99, state: oldSave(), sync: record }), SEED)));
    },
  },
  {
    name: 'save: the slices are written in a fixed order, sosChildId included',
    run(t) {
      const json = JSON.parse(serialiseState(state({ sosActive: true, sosChildId: 'c1' }))) as { state: Record<string, unknown> };
      t.deepEqual(Object.keys(json.state), ['children', 'activeChildId', 'requests', 'alerts', 'places', 'tasks', 'schedules', 'messages', 'sites', 'sosActive', 'sosChildId']);
      t.equal(json.state.sosChildId, 'c1');
      // A state object from older code without the field serialises as null, not as a missing key.
      const { sosChildId: _dropped, ...older } = state();
      t.equal((JSON.parse(serialiseState(older as PersistedState)) as { state: Record<string, unknown> }).state.sosChildId, null);
    },
  },
];
