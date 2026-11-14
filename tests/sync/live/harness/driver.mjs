/**
 * The test side of the live scenarios: starts "phones" (./phone.cjs, one node process each), cuts
 * and slows their network, and looks at the emulators directly (what the server really holds).
 *
 * Nothing here talks to a real Firebase project: the only addresses are the two local emulators.
 */
import { fork } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..', '..', '..');

export const PROJECT = 'demo-haven';
export const FIRESTORE = process.env.HAVEN_FIRESTORE_EMULATOR || '127.0.0.1:8085';
export const AUTH = process.env.HAVEN_AUTH_EMULATOR || '127.0.0.1:9099';
/** The address firestore.rules lets create a family (`ownerEmails()`). */
export const OWNER_EMAIL = 'owner@example.com';
export const PASSWORD = 'correct horse battery';

const DOCS = `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const WORK = process.env.HAVEN_LIVE_DIR || path.join(os.tmpdir(), 'haven-live');
const RUN = path.join(WORK, `run-${process.pid}`);
const CACHE = path.join(WORK, 'cache');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** JSON text with the keys of every object in alphabetical order: equal texts mean equal data, whatever order the keys were built in. */
export function canon(value) {
  return JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
}

/** Polls `test` (may be async) until it returns something truthy, which is returned. */
export async function until(test, label, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    last = await test();
    if (last) return last;
    if (Date.now() > end) throw new Error(`timeout after ${ms} ms waiting for: ${label}`);
    await sleep(25);
  }
}

// ---- HTTP to the emulators ------------------------------------------------------------------------------

async function http(method, url, body, headers = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

/** Bypasses the security rules, like the Admin SDK: for arranging and for looking, never for the app. */
const ADMIN = { Authorization: 'Bearer owner' };

/** Loads the repo's firestore.rules into the emulator for the test project. */
export async function loadRules() {
  const content = fs.readFileSync(path.join(REPO, 'firestore.rules'), 'utf8');
  const r = await http('PUT', `http://${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, { rules: { files: [{ content }] } });
  if (r.status !== 200) throw new Error(`could not load firestore.rules into the emulator: HTTP ${r.status} ${r.text.slice(0, 400)}`);
}

/** A clean slate: the rules loaded, no documents, no accounts. Call at the start of every scenario. */
export async function resetBackend() {
  await loadRules();
  // The emulator answers 499 ("call already cancelled") when the clearing reaches a listener whose
  // phone was killed a moment ago. Asking again works: by then it has noticed that the phone is gone.
  let docs = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    docs = await http('DELETE', `http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
    if (docs.status === 200) break;
    await sleep(150);
  }
  if (docs.status !== 200) throw new Error(`could not clear Firestore: HTTP ${docs.status} ${docs.text.slice(0, 200)}`);
  for (const top of ['families', 'users', 'pairing']) {
    const left = Object.keys(await server.collection(top));
    if (left.length > 0) throw new Error(`Firestore was cleared, but ${top} still has ${left.length} document(s)`);
  }
  const accounts = await http('DELETE', `http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`);
  if (accounts.status !== 200) throw new Error(`could not clear the Auth emulator: HTTP ${accounts.status} ${accounts.text.slice(0, 200)}`);
}

// ---- Firestore values <-> plain JSON ---------------------------------------------------------------------

function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  return v;
}
const decodeFields = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));

function encodeValue(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeValue(x)])) } };
}

const relPath = (name) => name.split('/documents/')[1];

/** What the server holds, read past the rules. Times come back as milliseconds. */
export const server = {
  /** One document's fields, or null when it does not exist. */
  async doc(docPath) {
    const r = await http('GET', `${DOCS}/${docPath}`, undefined, ADMIN);
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error(`GET ${docPath}: HTTP ${r.status} ${r.text.slice(0, 200)}`);
    return decodeFields(r.json.fields || {});
  },
  /** The documents of one collection: `{ id: fields }`. */
  async collection(collectionPath) {
    const out = {};
    let token = '';
    do {
      const r = await http('GET', `${DOCS}/${collectionPath}?pageSize=300${token ? `&pageToken=${token}` : ''}`, undefined, ADMIN);
      if (r.status !== 200) throw new Error(`LIST ${collectionPath}: HTTP ${r.status} ${r.text.slice(0, 200)}`);
      for (const d of r.json.documents || []) out[d.name.split('/').pop()] = decodeFields(d.fields || {});
      token = r.json.nextPageToken || '';
    } while (token);
    return out;
  },
  /** Every document under families/{fid} (the family document included): `{ 'families/x/places/p1': fields }`. */
  async family(familyId) {
    const out = {};
    const top = await server.doc(`families/${familyId}`);
    if (top) out[`families/${familyId}`] = top;
    const r = await http('POST', `${DOCS}/families/${familyId}:runQuery`, { structuredQuery: { from: [{ allDescendants: true }] } }, ADMIN);
    if (r.status !== 200) throw new Error(`runQuery families/${familyId}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
    for (const row of r.json || []) if (row.document) out[relPath(row.document.name)] = decodeFields(row.document.fields || {});
    return out;
  },
  /**
   * The family's synced data only (no members, no devices), as one sorted JSON text: two of these
   * are equal exactly when no synced document was created, changed or deleted in between.
   */
  async dataText(familyId) {
    const all = await server.family(familyId);
    const keep = Object.keys(all)
      .filter((p) => !p.includes('/members/') && !p.includes('/devices/'))
      .sort();
    return canon(keep.map((p) => [p, all[p]]));
  },
  /** Every families/{fid} id there is. */
  async familyIds() {
    return Object.keys(await server.collection('families'));
  },
  /** Changes fields of a document past the rules (to arrange a situation the app cannot produce by itself). */
  async patch(docPath, fields) {
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const r = await http('PATCH', `${DOCS}/${docPath}?${mask}`, { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])) }, ADMIN);
    if (r.status !== 200) throw new Error(`PATCH ${docPath}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
  },
  async remove(docPath) {
    const r = await http('DELETE', `${DOCS}/${docPath}`, undefined, ADMIN);
    if (r.status !== 200) throw new Error(`DELETE ${docPath}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
  },
};

/**
 * Reads a document the way a signed-in app would: with that account's ID token, through the
 * security rules. Returns the HTTP status (200 allowed, 403 refused, 404 not there).
 */
export async function readAs(idToken, docPath) {
  const r = await http('GET', `${DOCS}/${docPath}`, undefined, { Authorization: `Bearer ${idToken}` });
  return r.status;
}

/** The ID token a phone holds for its signed-in account, from its storage (where the Auth SDK keeps it). Null when signed out. */
export function idTokenOf(phone) {
  const disk = phone.disk();
  const key = Object.keys(disk).find((k) => k.startsWith('firebase:authUser:'));
  if (!key) return null;
  try {
    return JSON.parse(disk[key]).stsTokenManager.accessToken;
  } catch {
    return null;
  }
}

/** The Auth emulator's side doors. */
export const authEmulator = {
  /** Opens the confirmation link that was "emailed" to this address. */
  async confirmEmail(email) {
    const codes = await http('GET', `http://${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
    const mine = (codes.json?.oobCodes || []).filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL');
    if (mine.length === 0) throw new Error(`no confirmation email was sent to ${email}`);
    const link = mine[mine.length - 1].oobLink;
    const r = await fetch(link);
    if (r.status !== 200) throw new Error(`the confirmation link for ${email} answered HTTP ${r.status}`);
  },
  /** The accounts that exist: `[{ localId, email, emailVerified, ... }]`. */
  async accounts() {
    const r = await http('POST', `http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { returnUserInfo: true }, ADMIN);
    return r.json?.userInfo || [];
  },
};

// ---- a phone's network ------------------------------------------------------------------------------------

/**
 * A TCP relay between one phone and one emulator.
 *   offline('refuse')  every open connection is cut and new ones are refused at once (airplane mode)
 *   offline('hang')    nothing gets through and nothing answers (a dead connection)
 *   online()           traffic flows again
 *   latency(ms)        every chunk is held for that long, in each direction
 */
function relay(target) {
  const [host, port] = target.split(':');
  let mode = 'up';
  let delay = 0;
  const sockets = new Set();
  // One queue per direction, emptied strictly in arrival order: a change of the delay while chunks
  // are waiting must never let a later chunk overtake an earlier one.
  const forward = (from, to) => {
    const queue = [];
    let timer = null;
    const drain = () => {
      timer = null;
      while (queue.length > 0 && queue[0].at <= Date.now()) {
        const { chunk } = queue.shift();
        if (mode !== 'hang' && !to.destroyed) to.write(chunk);
      }
      if (queue.length > 0) timer = setTimeout(drain, Math.max(1, queue[0].at - Date.now()));
    };
    from.on('data', (chunk) => {
      if (mode === 'hang') return;
      if (delay === 0 && queue.length === 0) {
        if (!to.destroyed) to.write(chunk);
        return;
      }
      queue.push({ at: Date.now() + delay, chunk });
      if (timer === null) timer = setTimeout(drain, Math.max(1, delay));
    });
  };
  const listener = net.createServer((client) => {
    if (mode === 'refuse') {
      client.destroy();
      return;
    }
    sockets.add(client);
    client.on('error', () => {});
    client.on('close', () => sockets.delete(client));
    if (mode === 'hang') return;
    const upstream = net.connect(Number(port), host);
    sockets.add(upstream);
    upstream.on('error', () => {});
    const done = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    client.on('close', done);
    upstream.on('close', done);
    forward(client, upstream);
    forward(upstream, client);
  });
  return new Promise((resolve) =>
    listener.listen(0, '127.0.0.1', () =>
      resolve({
        address: `127.0.0.1:${listener.address().port}`,
        offline(how = 'refuse') {
          mode = how;
          if (how === 'refuse') {
            for (const s of sockets) s.destroy();
            sockets.clear();
          }
        },
        online() {
          const was = mode;
          mode = 'up';
          // Connections that were left hanging are dead: the phone has to dial again.
          if (was === 'hang') {
            for (const s of sockets) s.destroy();
            sockets.clear();
          }
        },
        latency(ms) {
          delay = ms;
        },
        close() {
          for (const s of sockets) s.destroy();
          listener.close();
        },
      }),
    ),
  );
}

// ---- phones ---------------------------------------------------------------------------------------------

const phones = new Set();

const PHONE_COMMANDS = ['mount', 'unmount', 'view', 'store', 'storeMany', 'link', 'linkStart', 'actionResult', 'fx', 'storage', 'appState', 'errors', 'vibrations', 'killOn'];

/**
 * A phone: its storage survives `kill()`; nothing else does.
 *   options.platform    'android' (default) | 'ios'. ('web' is accepted and makes the phone load the
 *                       web files and the SDK's memory-only sign-in; no scenario uses it.)
 *   options.deviceName  what expo-device reports
 */
export function makePhone(name, options = {}) {
  fs.mkdirSync(RUN, { recursive: true });
  const storageFile = path.join(RUN, `storage-${name}.json`);
  let child = null;
  let seq = 0;
  let wires = null;
  const waiting = new Map();
  let exitWaiters = [];

  const phone = {
    name,
    storageFile,
    get running() {
      return child !== null;
    },
    /** Starts the process (the app is not mounted yet). */
    async start(extraEnv = {}) {
      if (child) throw new Error(`${name} is already running`);
      if (!wires) wires = { firestore: await relay(FIRESTORE), auth: await relay(AUTH) };
      await new Promise((resolve, reject) => {
        const proc = fork(path.join(HERE, 'phone.cjs'), [], {
          env: {
            ...process.env,
            NODE_OPTIONS: '',
            NODE_TEST_CONTEXT: '',
            PHONE_NAME: name,
            PHONE_PLATFORM: options.platform || 'android',
            PHONE_DEVICE_NAME: options.deviceName || name,
            PHONE_STORAGE: storageFile,
            PHONE_CACHE: CACHE,
            PHONE_PROJECT: PROJECT,
            PHONE_FIRESTORE: wires.firestore.address,
            PHONE_AUTH: wires.auth.address,
            ...extraEnv,
          },
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        });
        child = proc;
        proc.on('message', (m) => {
          if (m.ready) return resolve();
          const w = waiting.get(m.id);
          if (!w) return;
          waiting.delete(m.id);
          if (m.ok) w.resolve(m.value);
          else w.reject(new Error(`[${name}] ${m.error}`));
        });
        proc.on('exit', () => {
          if (child === proc) child = null;
          for (const w of waiting.values()) w.reject(new Error(`[${name}] the app is gone (killed) before it answered "${w.cmd}"`));
          waiting.clear();
          for (const done of exitWaiters) done();
          exitWaiters = [];
        });
        proc.on('error', reject);
      });
      return phone;
    },
    /** A cold start of the app: process, providers mounted, saved state read. Returns the first view. */
    async launch(extraEnv) {
      await phone.start(extraEnv);
      return phone.call('mount');
    },
    call(cmd, ...args) {
      return new Promise((resolve, reject) => {
        if (!child) return reject(new Error(`[${name}] is not running (command "${cmd}")`));
        const id = ++seq;
        waiting.set(id, { resolve, reject, cmd });
        child.send({ id, cmd, args });
      });
    },
    /** The app is killed: no cleanup, timers lost. The storage file stays. */
    async kill() {
      if (!child) return;
      const proc = child;
      await new Promise((resolve) => {
        proc.once('exit', resolve);
        proc.kill('SIGKILL');
      });
    },
    /** Resolves when the process is gone (after `killOn`). */
    exited(ms = 15000) {
      if (!child) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`[${name}] was expected to die and is still running after ${ms} ms`)), ms);
        exitWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    async relaunch(extraEnv) {
      await phone.kill();
      return phone.launch(extraEnv);
    },
    /** Forgets everything on the phone (a fresh install). Only while the app is not running. */
    wipe() {
      if (child) throw new Error(`${name} is running`);
      fs.rmSync(storageFile, { force: true });
    },
    /** The storage as it is on disk right now: `{ key: string }`. */
    disk() {
      try {
        return JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      } catch {
        return {};
      }
    },
    /** Replaces the storage on disk. Only while the app is not running (it reads the file once, at start). */
    setDisk(data) {
      if (child) throw new Error(`${name} is running`);
      fs.writeFileSync(storageFile, JSON.stringify(data));
    },
    /** Waits inside the phone until `test(view)` holds. `test` must not use anything from outside itself. */
    waitFor(test, label, ms = 15000) {
      return phone.call('waitFor', typeof test === 'function' ? test.toString() : test, ms, label);
    },
    /** Waits until `test(view)` holds, polling from here: `test` may use anything. */
    async eventually(test, label, ms = 15000) {
      let last = null;
      try {
        return await until(
          async () => {
            last = await phone.call('view');
            return test(last) ? last : null;
          },
          `${name}: ${label}`,
          ms,
        );
      } catch (e) {
        e.message += `\n  link: ${JSON.stringify(last && last.link && { ...last.link, members: last.link.members.length })}`;
        throw e;
      }
    },
    waitStatus(status, ms = 15000) {
      return phone.call('waitFor', `(v) => v.link && v.link.status === ${JSON.stringify(status)}`, ms, `status ${status}`);
    },
    /** Takes the network away. `which`: 'both' (default), or only 'firestore' or only 'auth'. */
    offline(how = 'refuse', which = 'both') {
      if (which !== 'auth') wires.firestore.offline(how);
      if (which !== 'firestore') wires.auth.offline(how);
    },
    online() {
      wires.firestore.online();
      wires.auth.online();
    },
    latency(ms) {
      wires.firestore.latency(ms);
    },
    /** Kills the app and takes its network away for good (end of a scenario). */
    async dispose() {
      await phone.kill();
      if (wires) {
        wires.firestore.close();
        wires.auth.close();
        wires = null;
      }
      phones.delete(phone);
    },
  };
  for (const cmd of PHONE_COMMANDS) phone[cmd] = (...args) => phone.call(cmd, ...args);
  phones.add(phone);
  return phone;
}

/** Kills every phone that is still running. Call in `after`. */
export async function disposeAll() {
  for (const phone of [...phones]) await phone.dispose();
  fs.rmSync(RUN, { recursive: true, force: true });
}

// ---- reading the call log ----------------------------------------------------------------------------------

const isPresence = (e) => /\/devices\/[^/]+$/.test(e.path);

/**
 * The document writes in a call log (`phone.fx()`), "last seen" writes left out unless asked for.
 * Each entry: `{ op, path, keys, state }`.
 */
export function writesIn(log, { presence = false } = {}) {
  return log.filter((e) => e.kind === 'write' && (presence || !isPresence(e)));
}

/** "set families/x/places/p1 [name,ord]" per write, the family id shortened, for messages and comparisons. */
export function describeWrites(log, options) {
  return writesIn(log, options).map((e) => `${e.op} ${e.path.replace(/^families\/[^/]+\//, '')}${e.keys ? ` [${e.keys.join(',')}]` : ''}${e.state === 'failed' ? ` FAILED ${e.code}` : ''}`);
}

// ---- the common beginnings ---------------------------------------------------------------------------------

/** The outcome of a link action, or an error that says what the app said. */
export function ok(result, what) {
  if (!result || !result.ok) throw new Error(`${what} failed: ${result ? `${result.code}: ${result.message}` : 'no answer'}`);
  return result.value;
}

/** Signs up on `phone` and opens the confirmation link, so the account can create or join as a parent. */
export async function signUpVerified(phone, email, password = PASSWORD) {
  ok(await phone.link('signUp', email, password), `sign-up of ${email}`);
  await authEmulator.confirmEmail(email);
  const account = ok(await phone.link('refreshAccount'), 'refreshAccount');
  if (!account || !account.emailVerified) throw new Error(`${email} is still not confirmed after opening the link`);
  return account;
}

/**
 * A family with its founder on `parent`: sign-up, confirmation, creation. Resolves once the parent
 * is linked, settled in (its list of children has arrived) and its first "last seen" has gone out.
 * Returns `{ familyId, childId, uid }`.
 */
export async function createFamily(parent, { familyName = 'The Testers', childName = 'Zoe Tester', childAge = 9, email = OWNER_EMAIL } = {}) {
  await signUpVerified(parent, email);
  ok(await parent.link('createFamily', { familyName, childName, childAge }), 'createFamily');
  const v = await parent.eventually((x) => x.link.status === 'linked' && x.store.children.length === 1 && x.store.children[0].name === childName && x.link.members.length === 1, 'linked with the new family', 20000);
  return { familyId: v.link.familyId, childId: v.store.children[0].id, uid: v.link.account.uid };
}

/**
 * Enrols `joiner` with a code made on `parent`. `target`: `{ childId }`, `{ newChildName }`, or null
 * for a parent code (then `role` must be 'parent' and the joiner signed in with a confirmed account).
 * Resolves once the joiner is linked. Returns `{ code, uid, childId }`.
 */
export async function enrol(parent, joiner, target, role = 'child') {
  const offer = ok(await parent.link('createPairingCode', role), 'createPairingCode');
  ok(await joiner.link('joinWithCode', offer.code), 'joinWithCode');
  await parent.eventually((v) => v.link.offer && v.link.offer.claim, 'the claim to show on the parent');
  ok(await parent.link('approveClaim', target), 'approveClaim');
  const v = await joiner.eventually((x) => x.link.status === 'linked' && x.link.familyId !== null, 'the joiner to be linked', 20000);
  return { code: offer.code, uid: v.link.account.uid, childId: v.link.childId };
}

/** Waits until every phone given has gone `ms` without handing Firestore a write (the dust has settled). */
export async function quiet(phoneList, ms = 600, limit = 15000) {
  const end = Date.now() + limit;
  let since = Date.now();
  let seen = new Map();
  for (;;) {
    let moved = false;
    for (const p of phoneList) {
      const log = await p.fx(false);
      const pending = log.some((e) => e.kind === 'write' && e.state === 'sent');
      const count = log.length;
      if (seen.get(p) !== count || pending) moved = true;
      seen.set(p, count);
    }
    if (moved) since = Date.now();
    if (Date.now() - since >= ms) return;
    if (Date.now() > end) throw new Error(`the phones did not come to rest within ${limit} ms`);
    await sleep(50);
  }
}
