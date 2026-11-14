/** The schema table: codecs, field rules, role rules and the listener plan. */
import {
  CHILD_ALERT_KINDS,
  LIST_SLICES,
  SCHEMA,
  SOS,
  STATUS,
  createProblem,
  docProblems,
  fieldProblem,
  listenersFor,
  millisOf,
  normaliseTimes,
  type DocData,
  type ListSlice,
  type ListSpec,
  type SliceItems,
} from '@/sync/schema';
import type { Case } from '../support/assert';
import { alert, child, ctxOf, message, place, request, schedule, site, task, TS } from '../support/fixtures';

const parent = ctxOf('parent');
const kid = ctxOf('child', 'c1');

/** One valid item per slice, the context that may create it, and the child whose path it lives under. */
const SAMPLES: { [K in ListSlice]: { item: SliceItems[K]; ctx: typeof parent; childId?: string } } = {
  children: { item: child('c1', { checkInAt: 4000, updatedAgo: '2m ago' }), ctx: parent },
  requests: { item: request('r1', 'c1', { appId: 'a3', kind: 'unlock_app', minutes: undefined }), ctx: kid, childId: 'c1' },
  messages: { item: message('m1', 'c1', 'child'), ctx: kid, childId: 'c1' },
  alerts: { item: alert('n1'), ctx: kid },
  places: { item: place('p1'), ctx: parent },
  schedules: { item: schedule('s1'), ctx: parent },
  sites: { item: site('w1'), ctx: parent },
  tasks: { item: task('t1'), ctx: parent },
};

/** What the server stores for a created document: the sentinel becomes a time. */
const stored = (data: DocData, at = 7000): DocData => {
  const out: DocData = {};
  for (const [key, value] of Object.entries(data)) out[key] = value === TS ? at : value;
  return out;
};

export const cases: Case[] = [
  {
    name: 'codecs: every slice goes to a document and back with its stored fields intact',
    run(t) {
      for (const slice of LIST_SLICES) {
        const spec = SCHEMA[slice] as unknown as ListSpec;
        const { item, ctx, childId } = SAMPLES[slice];
        const data = spec.toDoc(item, ctx, { ord: 3 });
        t.deepEqual(docProblems(spec, item.id, data, 'create', ctx), [], `${slice}: toDoc must pass the rules`);
        t.deepEqual(Object.keys(data).filter((key) => !(key in spec.doc)), [], `${slice}: only stored fields`);
        const back = spec.fromDoc(item.id, stored(data), ctx, childId);
        t.ok(back, `${slice}: fromDoc`);
        for (const field of spec.fields) {
          t.deepEqual((back as unknown as DocData)[field], (item as unknown as DocData)[field], `${slice}.${field}`);
        }
        t.equal(back!.id, item.id);
        t.ok(spec.isItem(back), `${slice}: the decoded item is a complete local item`);
        // And once more: decoded, encoded and decoded again is stable.
        const again = spec.fromDoc(item.id, stored(spec.toDoc(back as never, ctx, { ord: 3 })), ctx, childId);
        t.deepEqual(again, back, `${slice}: stable`);
      }
    },
  },
  {
    name: 'codecs: labels and derived fields are never stored',
    run(t) {
      for (const slice of LIST_SLICES) {
        const spec = SCHEMA[slice] as unknown as ListSpec;
        const data = spec.toDoc(SAMPLES[slice].item, SAMPLES[slice].ctx);
        for (const key of ['id', 'ago', 'time', 'updatedAgo', 'checkInAt']) t.ok(!(key in data), `${slice} stores ${key}`);
        if (spec.scope === 'child') t.ok(!('childId' in data), `${slice}: the child is the path, not a field`);
      }
    },
  },
  {
    name: 'codecs: server-managed fields come from the context, never from the item',
    run(t) {
      const req = SCHEMA.requests.toDoc(request('r1', 'c1', { at: 123 }), kid);
      t.equal(req.at, TS);
      t.equal(req.by, 'uid-c1');
      t.ok(!('resolvedBy' in req) && !('resolvedAt' in req));
      t.deepEqual(SCHEMA.requests.updateFields({ status: 'approved' }, parent), { status: 'approved', resolvedBy: 'uid-parent', resolvedAt: TS });
      t.deepEqual(SCHEMA.tasks.updateFields({ done: true }, kid), { done: true });
      t.equal(SCHEMA.places.toDoc(place('p1'), parent).ord, 1_700_000_000_000, 'a new item is ordered by the clock');
      t.equal(SCHEMA.places.toDoc(place('p1'), parent, { ord: 2 }).ord, 2, 'a seeded item by its index');
      const msg = SCHEMA.messages.toDoc(message('m1', 'c1', 'parent'), parent);
      t.deepEqual(msg, { from: 'parent', text: 'hello m1', at: TS, by: 'uid-parent' });
    },
  },
  {
    name: 'codecs: derived fields come from the path and the time',
    run(t) {
      const now = 1_700_000_000_000;
      const r = SCHEMA.requests.fromDoc('r1', { kind: 'extra_time', label: 'x', detail: '', minutes: 30, status: 'pending', at: now - 5 * 60_000, by: 'u' }, parent, 'kidA');
      t.equal(r?.childId, 'kidA');
      t.equal(r?.ago, '5m ago');
      t.equal(r?.at, now - 5 * 60_000);
      const a = SCHEMA.alerts.fromDoc('n1', { kind: 'sos', childId: 'kidA', icon: 'alert-circle', color: '#FB4A4A', title: 'SOS', body: '', unread: true, at: now - 2 * 3_600_000, by: 'u' }, parent);
      t.equal(a?.ago, '2h');
      const m = SCHEMA.messages.fromDoc('m1', { from: 'child', text: 'hi', at: new Date(2026, 0, 15, 15, 42).getTime(), by: 'u' }, parent, 'kidA');
      t.equal(m?.time, '3:42 PM');
      t.equal(m?.childId, 'kidA');
      const c = SCHEMA.children.fromDoc('kidA', SCHEMA.children.toDoc(child('kidA'), parent), parent);
      t.equal(c?.updatedAgo, 'never');
      t.ok(c && !('checkInAt' in c) && !('ord' in c));
    },
  },
  {
    name: 'codecs: a pending server time is null and leaves `at` out; Timestamps and numbers both work',
    run(t) {
      const pending = SCHEMA.messages.fromDoc('m1', { from: 'child', text: 'hi', at: null, by: 'u' }, kid, 'c1');
      t.ok(pending && !('at' in pending));
      const timestamp = { toMillis: () => 4242, seconds: 4, nanoseconds: 242_000_000 };
      t.equal(SCHEMA.messages.fromDoc('m1', { from: 'child', text: 'hi', at: timestamp, by: 'u' }, kid, 'c1')?.at, 4242);
      t.equal(millisOf(timestamp), 4242);
      t.equal(millisOf({ seconds: 4, nanoseconds: 242_000_000 }), 4242);
      t.equal(millisOf(new Date(99)), 99);
      t.equal(millisOf(17), 17);
      t.equal(millisOf(null), null);
      t.equal(millisOf(undefined), null);
      t.equal(millisOf('yesterday'), null);
      t.deepEqual(normaliseTimes({ a: 1, at: timestamp, resolvedAt: null, checkInAt: { seconds: 1, nanoseconds: 0 } }), { a: 1, at: 4242, resolvedAt: null, checkInAt: 1000 });
    },
  },
  {
    name: 'codecs: a document that cannot be a local item decodes to null instead of breaking a screen',
    run(t) {
      t.equal(SCHEMA.places.fromDoc('p1', { name: 'Home', icon: 'home', radius: 'wide', arrive: true, leave: true, ord: 0 }, parent), null);
      t.equal(SCHEMA.children.fromDoc('c1', { ...SCHEMA.children.toDoc(child('c1'), parent), apps: [{ id: 'a1' }] }, parent), null);
      t.equal(SCHEMA.children.fromDoc('c1', { ...SCHEMA.children.toDoc(child('c1'), parent), weekly: [1, 2, 3] }, parent), null);
      t.equal(SCHEMA.requests.fromDoc('r1', { kind: 'extra_time', label: 'x', detail: '', status: 'maybe', at: 1, by: 'u' }, parent, 'c1'), null);
      t.equal(SCHEMA.requests.fromDoc('r1', { kind: 'extra_time', label: 'x', detail: '', status: 'pending', at: 1, by: 'u' }, parent), null, 'no child, no item');
      t.equal(SCHEMA.messages.fromDoc('m1', { from: 'teacher', text: 'x', at: 1, by: 'u' }, parent, 'c1'), null);
      t.equal(SCHEMA.alerts.fromDoc('n1', { icon: 'x', color: '#000000', title: 't', body: '', unread: true, at: 1, by: 'u' }, parent), null, 'kind and childId are part of a stored alert');
      t.equal(SCHEMA.tasks.fromDoc('t1', {}, parent), null);
    },
  },
  {
    name: 'codecs: the single documents',
    run(t) {
      t.equal(SOS.path('fam1'), 'families/fam1/signals/sos');
      t.deepEqual(SOS.toDoc({ active: true, childId: 'c1' }, kid), { active: true, childId: 'c1', by: 'uid-c1', at: TS });
      t.deepEqual(SOS.fromDoc({ active: true, childId: 'c1', by: 'u', at: 5 }), { active: true, childId: 'c1', at: 5 });
      t.deepEqual(SOS.fromDoc({ active: false, childId: 'c1', by: 'u', at: null }), { active: false, childId: 'c1', at: null });
      t.equal(SOS.fromDoc(null), null);
      t.equal(SOS.fromDoc(undefined), null);
      t.deepEqual(SOS.toLocal({ active: true, childId: 'c1', at: 5 }), { sosActive: true, sosChildId: 'c1' });
      t.deepEqual(SOS.toLocal({ active: false, childId: 'c1', at: 5 }), { sosActive: false, sosChildId: null }, 'no child is named when no SOS is on');
      t.deepEqual(SOS.toLocal(null), { sosActive: false, sosChildId: null });
      t.equal(STATUS.path('fam1', 'c1'), 'families/fam1/children/c1/live/status');
      t.deepEqual(STATUS.toDoc(kid), { checkInAt: TS, by: 'uid-c1' });
      t.deepEqual(STATUS.fromDoc({ checkInAt: 77, by: 'u' }), { checkInAt: 77 });
      t.deepEqual(STATUS.fromDoc({ checkInAt: null, by: 'u' }), { checkInAt: null });
      t.equal(STATUS.fromDoc(null), null);
    },
  },
  {
    name: 'paths: family collections and collections under a child',
    run(t) {
      t.equal(SCHEMA.places.docPath('F', 'p1'), 'families/F/places/p1');
      t.equal(SCHEMA.alerts.collectionPath('F'), 'families/F/alerts');
      t.equal(SCHEMA.children.docPath('F', 'c1'), 'families/F/children/c1');
      t.equal(SCHEMA.requests.docPath('F', 'r1', 'c1'), 'families/F/children/c1/requests/r1');
      t.equal(SCHEMA.messages.collectionPath('F', 'c1'), 'families/F/children/c1/messages');
      t.throws(() => SCHEMA.messages.docPath('F', 'm1'), /child id/);
    },
  },
  {
    name: 'field rules: the limits of firestore.rules, at and just past each boundary',
    run(t) {
      const ok = (slice: ListSlice, over: DocData) => {
        const spec = SCHEMA[slice] as unknown as ListSpec;
        const { item, ctx } = SAMPLES[slice];
        return docProblems(spec, item.id, { ...spec.toDoc(item, ctx, { ord: 0 }), ...over }, 'create', ctx);
      };
      const good = (slice: ListSlice, over: DocData) => t.deepEqual(ok(slice, over), [], `${slice} ${JSON.stringify(over).slice(0, 60)}`);
      const bad = (slice: ListSlice, over: DocData) => t.equal(ok(slice, over).length, 1, `${slice} ${JSON.stringify(over).slice(0, 60)} should be refused`);
      const s = (n: number) => 'x'.repeat(n);

      good('children', { name: s(60), age: 0, deviceName: s(60), battery: 100, usedMin: 1440, limitMin: 1440, place: s(60), placeIcon: s(40), apps: new Array(60).fill({}) });
      good('children', { age: 25, battery: 0, usedMin: 0, limitMin: 0, deviceName: '', place: '', placeIcon: '', apps: [] });
      for (const over of [{ name: '' }, { name: s(61) }, { age: -1 }, { age: 26 }, { age: '10' }, { deviceName: s(61) }, { battery: 101 }, { battery: -1 }, { online: 'yes' }, { bedtime: 0 }, { usedMin: 1441 }, { limitMin: 1441 }, { limitMin: -1 }, { place: s(61) }, { placeIcon: s(41) }, { apps: new Array(61).fill({}) }, { apps: 'none' }, { weekly: [1, 2, 3, 4, 5, 6] }, { ord: '1' }]) bad('children', over);

      good('requests', { label: s(80), detail: s(200), minutes: 240, appId: s(40) });
      good('requests', { minutes: 1, kind: 'bedtime' });
      for (const over of [{ kind: 'pizza' }, { label: '' }, { label: s(81) }, { detail: s(201) }, { minutes: 0 }, { minutes: 241 }, { minutes: 1.5 }, { appId: '' }, { appId: s(41) }, { status: 'maybe' }, { at: 12345 }, { by: 'someone-else' }]) bad('requests', over);

      good('messages', { text: s(2000) });
      for (const over of [{ text: '' }, { text: s(2001) }, { from: 'teacher' }, { at: null }, { by: '' }]) bad('messages', over);

      good('alerts', { kind: s(20), childId: null, icon: s(40), title: s(120), body: s(240), color: '#aBcDeF' });
      for (const over of [{ kind: '' }, { kind: s(21) }, { childId: 'a/b' }, { childId: 7 }, { icon: s(41) }, { color: 'red' }, { color: '#12345' }, { title: '' }, { title: s(121) }, { body: s(241) }, { unread: 'yes' }]) bad('alerts', over);

      good('places', { name: s(60), icon: s(40), radius: 100000 });
      good('places', { radius: 0.5 });
      for (const over of [{ name: '' }, { name: s(61) }, { icon: s(41) }, { radius: 0 }, { radius: -5 }, { radius: 100001 }, { arrive: 1 }, { leave: null }]) bad('places', over);

      good('schedules', { name: s(60), start: s(12), end: s(12), days: [1, 2, 3, 4, 5, 6, 7] });
      for (const over of [{ name: '' }, { color: '#GGGGGG' }, { start: '' }, { start: s(13) }, { end: '' }, { end: s(13) }, { days: [true] }, { on: 'on' }]) bad('schedules', over);

      good('sites', { host: s(253), list: 'allowed' });
      for (const over of [{ host: '' }, { host: s(254) }, { list: 'maybe' }]) bad('sites', over);

      good('tasks', { title: s(80), points: 1000 });
      good('tasks', { points: 0 });
      for (const over of [{ title: '' }, { title: s(81) }, { points: -1 }, { points: 1001 }, { points: 2.5 }, { done: 'yes' }]) bad('tasks', over);

      // Characters are counted, not UTF-16 units: 60 emoji are 60 characters.
      good('places', { name: '😀'.repeat(60) });
      bad('places', { name: '😀'.repeat(61) });
    },
  },
  {
    name: 'field rules: nothing but the listed fields, all the required ones, a valid id',
    run(t) {
      const data = SCHEMA.places.toDoc(place('p1'), parent, { ord: 0 });
      t.deepEqual(docProblems(SCHEMA.places, 'p1', { ...data, extra: 1 }, 'create'), ['extra is not a stored field']);
      const { leave: _leave, ...missing } = data;
      t.deepEqual(docProblems(SCHEMA.places, 'p1', missing, 'create'), ['leave is missing']);
      t.deepEqual(docProblems(SCHEMA.places, 'a/b', data, 'create'), ['the id is not a valid document id']);
      // minutes and appId are optional; resolvedBy and resolvedAt only come with an answer.
      const req = SCHEMA.requests.toDoc(request('r1', 'c1', { minutes: undefined }), kid);
      t.deepEqual(docProblems(SCHEMA.requests, 'r1', req, 'create', kid), []);
      t.deepEqual(docProblems(SCHEMA.requests, 'r1', { ...req, resolvedBy: 'uid-c1', resolvedAt: TS }, 'create', kid), ['resolvedBy cannot be set when creating', 'resolvedAt cannot be set when creating']);
      t.deepEqual(docProblems(SCHEMA.requests, 'r1', { ...req, resolvedBy: 'uid-c1', resolvedAt: TS }, 'update', kid), []);
      t.equal(fieldProblem({ type: 'time' }, 123, kid), 'is not the server time');
      t.equal(fieldProblem({ type: 'uid' }, 'uid-other', kid), 'is not this account');
    },
  },
  {
    name: 'roles: the access table says what firestore.rules says',
    run(t) {
      const table = Object.fromEntries(LIST_SLICES.map((slice) => [slice, SCHEMA[slice].access])) as Record<ListSlice, ListSpec['access']>;
      const brief = (slice: ListSlice, role: 'parent' | 'child') => {
        const a = table[slice][role];
        return `${a.read} ${a.create ? 'create' : '-'} ${a.update ? `update(${a.update.fields.join(',')})` : '-'} ${a.delete ? 'delete' : '-'}`;
      };
      t.equal(brief('children', 'parent'), 'all create update(name,age,deviceName,battery,online,bedtime,usedMin,limitMin,place,placeIcon,apps,weekly) -');
      t.equal(brief('children', 'child'), 'own - - -');
      t.equal(brief('requests', 'parent'), 'all - update(status) delete');
      t.equal(brief('requests', 'child'), 'own create - -');
      t.equal(brief('messages', 'parent'), 'all create - -');
      t.equal(brief('messages', 'child'), 'own create - -');
      t.equal(brief('alerts', 'parent'), 'all create update(unread) delete');
      t.equal(brief('alerts', 'child'), 'none create - -');
      for (const slice of ['places', 'schedules', 'sites'] as const) {
        t.ok(brief(slice, 'parent').startsWith('all create update('));
        t.ok(brief(slice, 'parent').endsWith(' delete'));
        t.equal(brief(slice, 'child'), 'all - - -');
      }
      t.equal(brief('tasks', 'parent'), 'all create update(title,points,done) delete');
      t.equal(brief('tasks', 'child'), 'all - update(done) -');

      const answer = SCHEMA.requests.access.parent.update;
      t.deepEqual(answer, { fields: ['status'], oneOf: { status: ['approved', 'denied'] }, when: { status: 'pending' }, stamps: { resolvedBy: 'uid', resolvedAt: 'time' } });
      t.deepEqual(SCHEMA.requests.access.child.create, { own: true, fixed: { status: 'pending' } });
      t.deepEqual(SCHEMA.alerts.access.parent.update, { fields: ['unread'], oneOf: { unread: [false] } });
      t.deepEqual(SCHEMA.alerts.access.child.create, { own: true, fixed: { unread: true }, oneOf: { kind: ['checkin', 'sos', 'request', 'left'] } });
      t.deepEqual(SCHEMA.messages.access.parent.create, { must: { from: 'parent' } });
      t.deepEqual(SCHEMA.messages.access.child.create, { own: true, must: { from: 'child' } });
      t.deepEqual([...CHILD_ALERT_KINDS], ['checkin', 'sos', 'request', 'left']);
    },
  },
  {
    name: 'roles: createProblem',
    run(t) {
      t.equal(createProblem(SCHEMA.places, place('p1'), parent), null);
      t.ok(createProblem(SCHEMA.places, place('p1'), kid));
      t.equal(createProblem(SCHEMA.requests, request('r1', 'c1'), kid), null);
      t.ok(createProblem(SCHEMA.requests, request('r1', 'c2'), kid), 'another child');
      t.ok(createProblem(SCHEMA.requests, request('r1', 'c1'), parent), 'a parent does not ask');
      t.equal(createProblem(SCHEMA.messages, message('m1', 'c1', 'child'), kid), null);
      t.ok(createProblem(SCHEMA.messages, message('m1', 'c1', 'parent'), kid));
      t.equal(createProblem(SCHEMA.messages, message('m1', 'c7', 'parent'), parent), null);
      t.ok(createProblem(SCHEMA.messages, message('m1', 'c1', 'child'), parent));
      for (const kind of CHILD_ALERT_KINDS) t.equal(createProblem(SCHEMA.alerts, alert('n1', { kind }), kid), null);
      t.ok(createProblem(SCHEMA.alerts, alert('n1', { kind: 'weekly' }), kid));
      t.ok(createProblem(SCHEMA.alerts, alert('n1', { childId: 'c2' }), kid));
      t.equal(createProblem(SCHEMA.alerts, alert('n1', { kind: 'weekly', childId: null }), parent), null);
      t.ok(createProblem(SCHEMA.children, child('c9'), kid));
      t.ok(createProblem(SCHEMA.tasks, task('t9'), kid));
    },
  },
  {
    name: 'listeners (rules 7 and 8): what each role listens to, bounded and with single-field ordering',
    run(t) {
      const p = listenersFor(parent, ['c1', 'c2']);
      t.deepEqual(
        p.map((l) => l.key),
        ['children', 'requests:c1', 'requests:c2', 'messages:c1', 'messages:c2', 'alerts', 'places', 'schedules', 'sites', 'tasks', 'status:c1', 'status:c2', 'sos'],
      );
      const by = (key: string) => p.find((l) => l.key === key)!;
      t.deepEqual({ ...by('children') }, { key: 'children', slice: 'children', kind: 'collection', path: 'families/fam1/children', orderBy: 'ord', dir: 'asc', limit: null });
      t.deepEqual({ ...by('requests:c2') }, { key: 'requests:c2', slice: 'requests', kind: 'collection', path: 'families/fam1/children/c2/requests', childId: 'c2', orderBy: 'at', dir: 'desc', limit: 100 });
      t.equal(by('messages:c1').limit, 300);
      t.equal(by('messages:c1').dir, 'desc');
      t.equal(by('alerts').limit, 200);
      t.deepEqual({ ...by('status:c1') }, { key: 'status:c1', slice: 'status', kind: 'doc', path: 'families/fam1/children/c1/live/status', childId: 'c1' });
      t.deepEqual({ ...by('sos') }, { key: 'sos', slice: 'sos', kind: 'doc', path: 'families/fam1/signals/sos' });

      // A child: its own child document, its own sub-collections, the family rules, no alerts.
      const c = listenersFor(kid, ['c1', 'c2', 'c3']);
      t.deepEqual(c.map((l) => l.key), ['children', 'requests:c1', 'messages:c1', 'places', 'schedules', 'sites', 'tasks', 'status:c1', 'sos']);
      t.deepEqual({ ...c[0] }, { key: 'children', slice: 'children', kind: 'doc', path: 'families/fam1/children/c1', childId: 'c1' });
      t.ok(!c.some((l) => l.slice === 'alerts'), 'a child never listens to alerts');
      for (const l of [...p, ...c]) t.ok(l.kind === 'doc' || l.orderBy === 'ord' || l.orderBy === 'at', 'one orderBy field, so no composite index');
    },
  },
];
