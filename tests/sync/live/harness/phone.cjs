'use strict';
/**
 * One "phone": the app's real StoreProvider and LinkProvider (src/state/store.tsx, src/sync/link.tsx
 * and everything they import, unmodified), mounted with the repo's React in a plain node process.
 * driver.mjs starts one process per phone and talks to it over IPC.
 *
 * What is real: every file under src/ that the two providers load, React 19, the Firebase SDK
 * (Firestore: its Node build; Auth: its React Native build, with the same AsyncStorage persistence
 * the phone uses, so src/sync/authInstance.native.ts is the file that runs), the emulators, the
 * security rules.
 *
 * What is replaced:
 *   react-native       Platform, AppState, Vibration, View, useColorScheme (objects below)
 *   expo-constants     the Firebase config and the emulator addresses a test build would carry
 *   expo-device        a device name
 *   AsyncStorage       a JSON file per phone, written synchronously on every setItem/removeItem.
 *                      Killing the process therefore loses exactly what a killed app loses: timers
 *                      and whatever had not been written yet.
 *   firebase/firestore the real module, with every call the app makes recorded (see `fx`)
 *
 * The TypeScript is compiled in memory with the repo's own `typescript` (types removed, JSX turned
 * into calls, CommonJS). The React Compiler that the app build runs is NOT applied here.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const SRC = path.join(REPO, 'src') + path.sep;
const env = process.env;

const NAME = env.PHONE_NAME || 'phone';
const PLATFORM = env.PHONE_PLATFORM || 'android';
const STORAGE_FILE = env.PHONE_STORAGE || '';
const CACHE_DIR = env.PHONE_CACHE || '';
const PROJECT = env.PHONE_PROJECT || 'demo-haven';
const VERBOSE = env.PHONE_VERBOSE === '1';

// ---- stand-ins for the native modules ---------------------------------------------------------------

const appStateListeners = new Set();
const vibrations = [];
const reactNative = {
  Platform: { OS: PLATFORM, select: (options) => (PLATFORM in options ? options[PLATFORM] : options.default) },
  AppState: {
    currentState: 'active',
    addEventListener(_type, listener) {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) };
    },
  },
  Vibration: { vibrate: (pattern) => vibrations.push(pattern) },
  View: function View() {
    return null;
  },
  useColorScheme: () => 'light',
};

/** What is "on the phone's disk". */
let disk = {};
if (STORAGE_FILE) {
  try {
    disk = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
  } catch {
    disk = {};
  }
}
const flushDisk = () => {
  if (STORAGE_FILE) fs.writeFileSync(STORAGE_FILE, JSON.stringify(disk));
};
const storageLog = [];
/** `killOn({ on: 'storage', key, phase })`: die right before or right after the next write of that key. */
let storageTrap = null;
const die = () => process.kill(process.pid, 'SIGKILL');
function trapped(key, phase) {
  const trap = storageTrap;
  if (!trap || trap.key !== key || trap.phase !== phase) return;
  trap.skip -= 1;
  if (trap.skip < 0) die();
}
const asyncStorage = {
  __esModule: true,
  default: {
    async getItem(key) {
      return key in disk ? disk[key] : null;
    },
    async setItem(key, value) {
      trapped(key, 'before');
      disk[key] = String(value);
      storageLog.push({ t: Date.now(), op: 'set', key, bytes: String(value).length });
      flushDisk();
      trapped(key, 'after');
    },
    async removeItem(key) {
      trapped(key, 'before');
      delete disk[key];
      storageLog.push({ t: Date.now(), op: 'remove', key });
      flushDisk();
      trapped(key, 'after');
    },
  },
};

const constants = {
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        firebase: env.PHONE_UNCONFIGURED === '1' ? undefined : { apiKey: 'demo-key', projectId: PROJECT, appId: '1:1:web:1' },
        firestoreEmulator: env.PHONE_FIRESTORE || '127.0.0.1:8085',
        authEmulator: env.PHONE_AUTH || '127.0.0.1:9099',
        variant: env.PHONE_VARIANT || undefined,
      },
    },
  },
};

const stubs = {
  'react-native': reactNative,
  '@react-native-async-storage/async-storage': asyncStorage,
  'expo-constants': constants,
  'expo-device': { deviceName: env.PHONE_DEVICE_NAME || NAME, modelName: 'Test phone' },
};

// ---- Firestore, with every call of the app recorded ---------------------------------------------------

/**
 * `log`: one entry per call, in order.
 *   { n, t, kind: 'write', op: 'set'|'update'|'delete'|'tx.set', path, keys, batch?, state: 'sent'|'acked'|'failed', code? }
 *   { n, t, kind: 'read', op: 'get'|'tx.get', path }
 *   { n, t, kind: 'listen', path }
 * A batch of k documents is k entries with the same `batch` number. A transaction is one entry.
 */
const fx = { log: [], n: 0, batches: 0, traps: [] };
function record(entry) {
  entry.n = ++fx.n;
  entry.t = Date.now();
  fx.log.push(entry);
  if (entry.kind === 'write') {
    for (const trap of fx.traps) {
      if (entry.path.includes(trap.pathIncludes)) setTimeout(die, trap.afterMs || 0);
    }
  }
  return entry;
}
const pathOf = (ref) => {
  if (ref && typeof ref.path === 'string') return ref.path;
  try {
    return ref._query.path.canonicalString();
  } catch {
    return '?';
  }
};
const keysOf = (data) => (data && typeof data === 'object' ? Object.keys(data).sort() : undefined);
const codeOf = (error) => (error && (error.code || error.name)) || 'error';
function follow(entries, promise) {
  promise.then(
    () => {
      for (const e of entries) {
        e.state = 'acked';
        e.ackedAt = Date.now();
      }
    },
    (error) => {
      for (const e of entries) {
        e.state = 'failed';
        e.code = codeOf(error);
      }
    },
  );
  return promise;
}
let wrapped = null;
function wrapFirestore(real) {
  if (wrapped) return wrapped;
  const w = { ...real };
  w.setDoc = (ref, data, ...rest) => follow([record({ kind: 'write', op: 'set', path: ref.path, keys: keysOf(data), state: 'sent' })], real.setDoc(ref, data, ...rest));
  w.updateDoc = (ref, data, ...rest) => follow([record({ kind: 'write', op: 'update', path: ref.path, keys: keysOf(data), state: 'sent' })], real.updateDoc(ref, data, ...rest));
  w.deleteDoc = (ref) => follow([record({ kind: 'write', op: 'delete', path: ref.path, state: 'sent' })], real.deleteDoc(ref));
  w.writeBatch = (db) => {
    const batch = real.writeBatch(db);
    const ops = [];
    const self = {
      set(ref, data, ...rest) {
        ops.push({ op: 'set', path: ref.path, keys: keysOf(data) });
        batch.set(ref, data, ...rest);
        return self;
      },
      update(ref, data, ...rest) {
        ops.push({ op: 'update', path: ref.path, keys: keysOf(data) });
        batch.update(ref, data, ...rest);
        return self;
      },
      delete(ref) {
        ops.push({ op: 'delete', path: ref.path });
        batch.delete(ref);
        return self;
      },
      commit() {
        const id = ++fx.batches;
        return follow(ops.map((o) => record({ kind: 'write', ...o, batch: id, state: 'sent' })), batch.commit());
      },
    };
    return self;
  };
  w.runTransaction = (db, work, options) => {
    const entry = record({ kind: 'write', op: 'tx.set', path: '?', attempts: 0, state: 'sent' });
    return follow(
      [entry],
      real.runTransaction(
        db,
        (tx) => {
          entry.attempts += 1;
          const proxy = {
            get(ref) {
              // A transaction that fails before it writes (no connection) is still "a write to that document" in the log.
              if (entry.path === '?') entry.path = ref.path;
              record({ kind: 'read', op: 'tx.get', path: ref.path });
              return tx.get(ref);
            },
            set(ref, data, ...rest) {
              entry.path = ref.path;
              entry.keys = keysOf(data);
              tx.set(ref, data, ...rest);
              return proxy;
            },
            update(ref, data, ...rest) {
              entry.path = ref.path;
              entry.keys = keysOf(data);
              tx.update(ref, data, ...rest);
              return proxy;
            },
            delete(ref) {
              entry.path = ref.path;
              tx.delete(ref);
              return proxy;
            },
          };
          return work(proxy);
        },
        options,
      ),
    );
  };
  for (const name of ['getDocFromServer', 'getDoc', 'getDocs', 'getDocsFromServer']) {
    w[name] = (ref, ...rest) => {
      record({ kind: 'read', op: 'get', path: pathOf(ref) });
      return real[name](ref, ...rest);
    };
  }
  w.onSnapshot = (ref, ...rest) => {
    record({ kind: 'listen', path: pathOf(ref) });
    return real.onSnapshot(ref, ...rest);
  };
  wrapped = w;
  return w;
}

// ---- loading the app's TypeScript ---------------------------------------------------------------------

const ts = require(path.join(REPO, 'node_modules', 'typescript'));
const COMPILER_OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  inlineSourceMap: true,
  inlineSources: true,
};
function compile(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  let output = null;
  let cacheFile = null;
  if (CACHE_DIR) {
    const key = crypto.createHash('sha1').update(ts.version).update(filename).update(source).digest('hex');
    cacheFile = path.join(CACHE_DIR, `${key}.js`);
    try {
      output = fs.readFileSync(cacheFile, 'utf8');
    } catch {
      output = null;
    }
  }
  if (output === null) {
    output = ts.transpileModule(source, { fileName: filename, compilerOptions: COMPILER_OPTIONS }).outputText;
    if (cacheFile) {
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, output);
      } catch {
        // The cache is a convenience.
      }
    }
  }
  module._compile(output, filename);
}
Module._extensions['.ts'] = compile;
Module._extensions['.tsx'] = compile;
process.setSourceMapsEnabled(true);

/** The file Metro would pick for an import without extension: `x.android.ts`, `x.native.ts`, `x.ts`, then the same for `.tsx`. */
function sourceFile(base) {
  const native = PLATFORM === 'android' || PLATFORM === 'ios';
  for (const ext of ['.ts', '.tsx']) {
    for (const infix of [`.${PLATFORM}`, ...(native ? ['.native'] : []), '']) {
      const candidate = `${base}${infix}${ext}`;
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** The React Native build of Firebase Auth: the one Metro bundles on a phone (`getReactNativePersistence` lives there). */
const RN_AUTH = path.join(REPO, 'node_modules', '@firebase', 'auth', 'dist', 'rn', 'index.js');

const fromApp = (parent) => Boolean(parent && parent.filename && parent.filename.startsWith(SRC));
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request in stubs) return request;
  if (request.startsWith('@/')) {
    const file = sourceFile(path.join(SRC, request.slice(2)));
    if (file) return file;
  }
  if (fromApp(parent)) {
    if (request.startsWith('./') || request.startsWith('../')) {
      const file = sourceFile(path.resolve(path.dirname(parent.filename), request));
      if (file) return file;
    }
    if (request === 'firebase/auth' && PLATFORM !== 'web') return RN_AUTH;
  }
  return resolveFilename.call(this, request, parent, ...rest);
};
const load = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request in stubs) return stubs[request];
  if (request === 'firebase/firestore' && fromApp(parent)) return wrapFirestore(load.call(this, request, parent, ...rest));
  return load.call(this, request, parent, ...rest);
};

// ---- a container React DOM accepts; nothing is ever drawn into it ----------------------------------------

function fakeNode(nodeType, nodeName) {
  return {
    nodeType,
    nodeName,
    tagName: nodeName,
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    childNodes: [],
    firstChild: null,
    lastChild: null,
    parentNode: null,
    textContent: '',
    style: {},
    addEventListener() {},
    removeEventListener() {},
    appendChild: (c) => c,
    removeChild: (c) => c,
    insertBefore: (c) => c,
    contains: () => true,
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
  };
}
const doc = fakeNode(9, '#document');
const html = fakeNode(1, 'HTML');
const body = fakeNode(1, 'BODY');
const container = fakeNode(1, 'DIV');
doc.documentElement = html;
doc.body = body;
doc.activeElement = body;
doc.createElement = (t) => Object.assign(fakeNode(1, String(t).toUpperCase()), { ownerDocument: doc });
doc.createTextNode = () => Object.assign(fakeNode(3, '#text'), { ownerDocument: doc });
doc.ownerDocument = null;
for (const n of [html, body, container]) n.ownerDocument = doc;
body.parentNode = html;
container.parentNode = body;
const win = { document: doc, HTMLIFrameElement: function HTMLIFrameElement() {}, addEventListener() {}, removeEventListener() {}, getSelection: () => null, location: { protocol: 'http:' }, navigator: { userAgent: 'node' } };
doc.defaultView = win;
globalThis.window = globalThis.window || win;
globalThis.document = globalThis.document || doc;

// On a phone `navigator.product` is "ReactNative"; the Firebase SDK looks at it (Auth, for one, waits
// 60 instead of 30 seconds for a server that does not answer).
if (PLATFORM !== 'web') {
  try {
    Object.defineProperty(globalThis.navigator, 'product', { value: 'ReactNative', configurable: true });
  } catch {
    // Not essential.
  }
}

// ---- what the app prints ---------------------------------------------------------------------------------

const errors = [];
const note = (level, args) => {
  const text = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 1200);
  errors.push({ t: Date.now(), level, text });
  if (VERBOSE) process.stderr.write(`[${NAME}] ${level}: ${text}\n`);
};
console.error = (...args) => note('error', args);
console.warn = (...args) => note('warn', args);
process.on('unhandledRejection', (e) => note('unhandledRejection', [e]));
process.on('uncaughtException', (e) => note('uncaughtException', [e]));

// ---- the app ---------------------------------------------------------------------------------------------

const React = require('react');
const { createRoot } = require('react-dom/client');
const { jsx } = require('react/jsx-runtime');
const { StoreProvider, useStore } = require(path.join(SRC, 'state', 'store.tsx'));
const { LinkProvider, useLink } = require(path.join(SRC, 'sync', 'link.tsx'));

const live = { store: null, link: null, renders: 0 };
/** `killOn({ on: 'view', test, afterMs })`: checked at every commit of the providers. */
let viewTrap = null;
function Probe() {
  live.store = useStore();
  live.link = useLink();
  live.renders += 1;
  React.useEffect(() => {
    checkViewTrap();
  });
  return null;
}

let root = null;
function mountApp() {
  root = createRoot(container, {
    onUncaughtError: (e) => note('uncaught', [e]),
    onCaughtError: (e) => note('caught', [e]),
    onRecoverableError: (e) => note('recoverable', [e]),
  });
  const tree = jsx(StoreProvider, { children: jsx(LinkProvider, { children: jsx(Probe, {}) }) });
  root.render(env.PHONE_STRICT === '1' ? jsx(React.StrictMode, { children: tree }) : tree);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test, ms, label) {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try {
      ok = Boolean(test());
    } catch {
      ok = false;
    }
    if (ok) return;
    if (Date.now() > end) throw new Error(`timeout after ${ms} ms waiting for ${label}`);
    await sleep(10);
  }
}

const LINK_DATA = ['status', 'configured', 'account', 'familyId', 'familyName', 'role', 'childId', 'members', 'offer', 'pendingJoin', 'lastSyncedAt', 'error'];
const STORE_DATA = ['ready', 'live', 'role', 'activeChildId', 'children', 'requests', 'messages', 'alerts', 'places', 'schedules', 'sites', 'tasks', 'sosActive', 'sosChildId', 'sosMine', 'points', 'hasOnboarded'];
function view() {
  const s = live.store;
  const l = live.link;
  if (!s) return { mounted: root !== null, store: null, link: null };
  const store = Object.fromEntries(STORE_DATA.map((key) => [key, s[key]]));
  store.selfId = s.childSelf.id;
  store.sosChildName = s.sosChild.name;
  return { mounted: true, at: Date.now(), renders: live.renders, store, link: l ? Object.fromEntries(LINK_DATA.map((key) => [key, l[key]])) : null };
}

/** A test written as source text, `(v) => ...`, evaluated against `view()`. Only the test driver sends these. */
const compileTest = (source) => new Function('v', `return (${source})(v);`);

function checkViewTrap() {
  const trap = viewTrap;
  if (!trap || trap.fired) return;
  let hit = false;
  try {
    hit = Boolean(trap.test(view()));
  } catch {
    hit = false;
  }
  if (!hit) return;
  trap.fired = true;
  if (trap.afterMs > 0) setTimeout(die, trap.afterMs);
  else die();
}

const pendingActions = new Map();
let actionSeq = 0;
const outcome = (work) =>
  work.then(
    (value) => ({ ok: true, value: value === undefined ? null : value }),
    (e) => ({ ok: false, code: (e && e.code) || null, name: (e && e.name) || null, message: (e && e.message) || String(e) }),
  );

const handlers = {
  /** Mounts the providers and waits until the store has read its saved state and the link layer is there. */
  async mount() {
    mountApp();
    await until(() => live.store && live.store.ready && live.link, 20000, 'the providers to mount');
    return view();
  },
  async unmount() {
    if (root) root.unmount();
    root = null;
    await sleep(20);
    return true;
  },
  view: async () => view(),
  /** Waits (inside the phone, so nothing is missed between polls) until `source` holds for the view. */
  async waitFor(source, ms, label) {
    const test = compileTest(source);
    await until(() => test(view()), ms || 15000, label || source);
    return view();
  },
  /** Calls a store action, as a tap on a screen would. Returns what the action returned. */
  async store(method, ...args) {
    const result = live.store[method](...args);
    await sleep(0);
    return result === undefined ? null : result;
  },
  /** Several store actions in the same tick. */
  async storeMany(calls) {
    for (const [method, ...args] of calls) live.store[method](...args);
    await sleep(0);
    return true;
  },
  /** Calls a LinkState action and waits for it. `{ ok, value }` or `{ ok: false, code, message }`. */
  link: (method, ...args) => outcome(Promise.resolve().then(() => live.link[method](...args))),
  /** Starts a LinkState action without waiting; ask for the outcome with `actionResult(id)`. */
  async linkStart(method, ...args) {
    const id = ++actionSeq;
    const slot = { done: false, result: null };
    pendingActions.set(id, slot);
    outcome(Promise.resolve().then(() => live.link[method](...args))).then((result) => Object.assign(slot, { done: true, result }));
    return id;
  },
  actionResult: async (id) => pendingActions.get(id) || null,
  /** The Firestore calls the app has made since the last `fx(true)`. */
  fx: async (reset) => {
    const log = fx.log.map((e) => ({ ...e }));
    if (reset) fx.log = [];
    return log;
  },
  storage: async () => ({ data: { ...disk }, log: storageLog.splice(0) }),
  async appState(state) {
    reactNative.AppState.currentState = state;
    for (const listener of [...appStateListeners]) listener(state);
    await sleep(0);
    return true;
  },
  errors: async () => errors.splice(0),
  vibrations: async () => vibrations.splice(0),
  /**
   * Arranges the death of this process, as abrupt as a killed app (SIGKILL: no cleanup, nothing flushed):
   *   { on: 'view', test: '(v) => ...', afterMs }       when the providers commit a state for which the test holds
   *   { on: 'storage', key, phase: 'before'|'after', skip }  around a write of that AsyncStorage key
   *   { on: 'write', pathIncludes, afterMs }            when the app hands Firestore a write for such a path
   *   { on: 'now', afterMs }
   */
  async killOn(spec) {
    if (spec.on === 'view') {
      viewTrap = { test: compileTest(spec.test), afterMs: spec.afterMs || 0, fired: false };
      checkViewTrap();
    } else if (spec.on === 'storage') {
      storageTrap = { key: spec.key, phase: spec.phase || 'after', skip: spec.skip || 0 };
    } else if (spec.on === 'write') {
      fx.traps.push({ pathIncludes: spec.pathIncludes, afterMs: spec.afterMs || 0 });
    } else if (spec.on === 'now') {
      setTimeout(die, spec.afterMs || 0);
    } else {
      throw new Error(`killOn: unknown trigger ${JSON.stringify(spec)}`);
    }
    return true;
  },
  sleep: async (ms) => {
    await sleep(ms);
    return true;
  },
};

if (process.send) {
  process.on('message', (message) => {
    const handler = handlers[message.cmd];
    Promise.resolve()
      .then(() => {
        if (!handler) throw new Error(`unknown command ${message.cmd}`);
        return handler(...(message.args || []));
      })
      .then(
        (value) => process.send({ id: message.id, ok: true, value }),
        (e) => process.send({ id: message.id, ok: false, error: String(e && e.stack ? e.stack : e) }),
      );
  });
  process.send({ ready: true });
} else {
  // Run on its own: mount, print what a screen would see, leave.
  handlers.mount().then(
    (v) => {
      process.stdout.write(`${JSON.stringify({ status: v.link.status, children: v.store.children.map((c) => c.name), errors }, null, 1)}\n`);
      process.exit(0);
    },
    (e) => {
      process.stderr.write(`mount failed: ${e && e.stack}\n${JSON.stringify(errors, null, 1)}\n`);
      process.exit(1);
    },
  );
}
