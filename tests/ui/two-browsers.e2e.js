// Two browsers, one parent and one child, through the real screens against the local emulators.
//
// Needs the Firestore emulator on 127.0.0.1:8085 and the Auth emulator on 127.0.0.1:9099, and a web
// export of the app that points at them:
//
//   HAVEN_FIREBASE_CONFIG='{"apiKey":"demo-key","projectId":"demo-haven","appId":"1:1:web:1"}' \
//   HAVEN_FIRESTORE_EMULATOR=127.0.0.1:8085 HAVEN_AUTH_EMULATOR=127.0.0.1:9099 \
//     npx expo export --platform web --output-dir /tmp/haven-web
//   node tests/ui/two-browsers.e2e.js /tmp/haven-web
//
// It loads firestore.rules into project demo-haven and wipes that project in both emulators, so do
// not run it together with tests/sync/live. Playwright must be installed (it is not a dependency of
// the app). Screenshots go to ./shots next to this file (ignored by git).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('usage: node tests/ui/two-browsers.e2e.js <folder of a web export>');
  process.exit(2);
}
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8096;
const BASE = `http://127.0.0.1:${PORT}`;
const FS_EMU = 'http://127.0.0.1:8085';
const AUTH_EMU = 'http://127.0.0.1:9099';
const PROJECT = 'demo-haven';
const ADMIN = { Authorization: 'Bearer owner' };
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const results = [];
let failed = 0;
function check(name, ok, detail) {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!ok) failed += 1;
  console.log(results[results.length - 1]);
}

async function resetBackend() {
  const rules = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
  let r = await fetch(`${FS_EMU}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ content: rules }] } }) });
  if (!r.ok) throw new Error('rules not loaded: ' + r.status + ' ' + (await r.text()).slice(0, 300));
  for (let i = 0; i < 3; i++) {
    r = await fetch(`${FS_EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    if (r.ok) break;
  }
  await fetch(`${AUTH_EMU}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

async function confirmEmail(email) {
  const r = await fetch(`${AUTH_EMU}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const codes = (await r.json()).oobCodes || [];
  const mine = codes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').pop();
  if (!mine) throw new Error('no verification email for ' + email);
  const done = await fetch(mine.oobLink);
  if (!done.ok) throw new Error('verification link failed: ' + done.status);
}

async function serverDocs(collectionPath) {
  const r = await fetch(`${FS_EMU}/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}?pageSize=100`, { headers: ADMIN });
  const j = await r.json();
  return j.documents || [];
}

const state = (page) => page.evaluate(() => {
  const h = window.__haven;
  if (!h) return null;
  return {
    status: h.link.status, role: h.link.role, childId: h.link.childId, family: h.link.familyName, email: h.link.account ? h.link.account.email : null,
    verified: h.link.account ? h.link.account.emailVerified : null, members: h.link.members.length, offer: h.link.offer, pendingJoin: h.link.pendingJoin,
    live: h.store.live, storeRole: h.store.role, children: h.store.children.map((c) => ({ id: c.id, name: c.name, limitMin: c.limitMin })), requests: h.store.requests.map((r) => ({ kind: r.kind, status: r.status, minutes: r.minutes })),
    selfName: h.store.childSelf.name,
  };
});
const waitState = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout });
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
const pathOf = (page) => new URL(page.url()).pathname;
// React Native Web keeps the screens underneath in the page, hidden: only look at what is visible.
const vis = (locator) => locator.locator('visible=true');
const T = (page, t, exact = true) => vis(page.getByText(t, { exact })).first();
const B = (page, name, exact = true) => vis(page.getByRole('button', { name, exact }));
const L = (page, label, exact = true) => vis(page.getByLabel(label, { exact })).first();
async function tap(page, name) {
  const button = B(page, name).first();
  if (await button.count()) return button.click();
  return T(page, name).click();
}
const text = (page) => page.evaluate(() => {
  // innerText of the visible screen only
  const out = [];
  const walk = (node) => {
    if (node.nodeType === 3) { if (node.textContent.trim()) out.push(node.textContent); return; }
    if (node.nodeType !== 1) return;
    const st = getComputedStyle(node);
    if (st.display === 'none' || st.visibility === 'hidden' || node.getAttribute('aria-hidden') === 'true') return;
    for (const c of node.childNodes) walk(c);
  };
  walk(document.body);
  return out.join('\n');
});

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  await resetBackend();
  const browser = await chromium.launch();
  const errors = { parent: [], child: [] };
  const mk = async (who) => {
    const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors[who].push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors[who].push('pageerror: ' + String(e).slice(0, 300)));
    return page;
  };
  const parent = await mk('parent');
  const child = await mk('child');

  try {
    // ---- parent: first run -> chooser -> account ----
    await parent.goto(BASE + '/', { waitUntil: 'load' });
    await B(parent, 'Skip introduction').click({ timeout: 30000 });
    await B(parent, "I'm a parent").click({ timeout: 20000 });
    await parent.waitForURL('**/account', { timeout: 15000 });
    check('parent: choosing "I\'m a parent" opens the account screen', pathOf(parent) === '/account');
    await shot(parent, '01-parent-account');

    // create account
    await tap(parent, 'Create account');
    await L(parent, 'Email').fill('owner@example.com');
    await L(parent, 'Password').fill('short');
    const createBtn = B(parent, 'Create account').last();
    check('parent: a short password cannot be submitted', await createBtn.isDisabled());
    await L(parent, 'Password').fill('correct horse battery');
    await createBtn.click();
    await T(parent, 'Confirm your email').waitFor({ timeout: 20000 });
    let s = await state(parent);
    check('parent: after sign-up the account is signed in and not confirmed', s.email === 'owner@example.com' && s.verified === false, JSON.stringify({ status: s.status, verified: s.verified }));
    await shot(parent, '02-parent-confirm-email');

    // not confirmed yet
    await tap(parent, 'I’ve confirmed it');
    await T(parent, 'Not confirmed yet').waitFor({ timeout: 15000 });
    check('parent: "I’ve confirmed it" before confirming says so', true);

    await confirmEmail('owner@example.com');
    await tap(parent, 'I’ve confirmed it');
    await T(parent, 'Create your family').waitFor({ timeout: 20000 });
    s = await state(parent);
    check('parent: after the link is opened the family form shows', s.status === 'needs-family' && s.verified === true, s.status);
    await shot(parent, '03-parent-create-family');

    await L(parent, 'Family name').fill('Test family');
    await L(parent, 'Child’s first name').fill('Aisha');
    await L(parent, 'Child’s age').fill('9');
    await tap(parent, 'Create family');
    await T(parent, 'Your family is ready').waitFor({ timeout: 30000 });
    await waitState(parent, () => window.__haven.link.status === 'linked' && window.__haven.store.children.length === 1 && window.__haven.store.children[0].name === 'Aisha');
    s = await state(parent);
    check('parent: family created, role parent, one child named Aisha, sample children gone', s.role === 'parent' && s.live === true && s.children.length === 1 && s.children[0].name === 'Aisha' && s.family === 'Test family', JSON.stringify(s.children));
    await shot(parent, '04-parent-family-ready');

    // pairing code
    await tap(parent, 'Link your child’s phone');
    await parent.waitForURL('**/pairing', { timeout: 15000 });
    await T(parent, 'A child’s phone').click();
    await waitState(parent, () => window.__haven.link.offer !== null);
    s = await state(parent);
    const code = s.offer.code;
    check('parent: a code for a child’s phone is on offer', s.offer.role === 'child' && /^[A-Z2-9]{8}$/.test(code), code);
    await shot(parent, '05-parent-code');

    // ---- child: first run -> chooser -> family link ----
    await child.goto(BASE + '/', { waitUntil: 'load' });
    await B(child, 'Skip introduction').click({ timeout: 30000 });
    await B(child, "This is my child's device").click({ timeout: 20000 });
    await child.waitForURL('**/link-device', { timeout: 15000 });
    check('child: choosing "This is my child\'s device" opens Family link', pathOf(child) === '/link-device');

    // wrong code first
    await L(child, 'Pairing code').fill('ABCDEFGH');
    await tap(child, 'Link this phone');
    await T(child, "That didn't work").waitFor({ timeout: 20000 });
    let cs = await state(child);
    check('child: a wrong code is refused and leaves the phone signed out', cs.status === 'signed-out' && cs.pendingJoin === null, cs.status);

    await L(child, 'Pairing code').fill(code.toLowerCase());
    await tap(child, 'Link this phone');
    await T(child, 'Waiting for a parent').waitFor({ timeout: 20000 });
    cs = await state(child);
    await waitState(parent, () => window.__haven.link.offer && window.__haven.link.offer.claim !== null);
    s = await state(parent);
    check('both phones show the same 4-character check', cs.pendingJoin && s.offer.claim && cs.pendingJoin.check === s.offer.claim.check && cs.pendingJoin.check.length === 4, `${cs.pendingJoin && cs.pendingJoin.check} / ${s.offer.claim && s.offer.claim.check}`);
    check('child: not a member before approval', cs.role === null && cs.live === false && cs.status === 'waiting', cs.status);
    await shot(child, '06-child-waiting');
    await shot(parent, '07-parent-claim');
    const parentText = await text(parent);
    check('parent: the claim card asks for the check and whose phone it is', parentText.includes('wants to join') && parentText.includes('Whose phone is it?'));

    const approveBtn = B(parent, 'Approve').first();
    check('parent: Approve is off until the 4 characters are typed', await approveBtn.isDisabled());
    const wrong = s.offer.claim.check === 'AAAA' ? 'BBBB' : 'AAAA';
    await L(parent, 'The 4 characters shown on the other phone').fill(wrong);
    await T(parent, 'These do not match. Check them again on the other phone. If it really shows other characters, someone else used the code: decline it.').waitFor({ timeout: 10000 });
    check('parent: wrong characters keep Approve off and say why', await approveBtn.isDisabled());
    await L(parent, 'The 4 characters shown on the other phone').fill(cs.pendingJoin.check.toLowerCase());
    await T(parent, 'They match. Approve if this is the phone you expect.').waitFor({ timeout: 10000 });
    check('parent: the right characters (any letter case) switch Approve on', !(await approveBtn.isDisabled()));
    await approveBtn.click();
    await T(parent, 'Done').waitFor({ timeout: 20000 });
    await waitState(child, () => window.__haven.link.role === 'child' && window.__haven.link.status === 'linked' && window.__haven.store.children.length === 1 && window.__haven.store.children[0].name === 'Aisha', null, 40000);
    cs = await state(child);
    check('child: linked as Aisha with the server role child', cs.role === 'child' && cs.live === true && cs.selfName === 'Aisha' && cs.storeRole === 'child', JSON.stringify({ role: cs.role, self: cs.selfName }));
    await T(child, "You're linked").waitFor({ timeout: 10000 });
    await shot(child, '08-child-linked');
    await tap(child, 'Done');
    await child.waitForURL('**/home', { timeout: 15000 });
    await shot(child, '09-child-home');
    const homeText = await text(child);
    check('child home: shows the agreed limit and no "used" claim', homeText.includes('a day') && !homeText.includes("You've used"), '');

    // ---- role lock on the child's phone ----
    await child.goto(BASE + '/dashboard', { waitUntil: 'load' });
    await child.waitForTimeout(4000);
    check('child phone: opening the parent dashboard lands on the child side', !['/dashboard', '/pairing'].includes(pathOf(child)), pathOf(child));
    await child.goto(BASE + '/pairing', { waitUntil: 'load' });
    await child.waitForTimeout(4000);
    check('child phone: opening Devices & Pairing lands on the child side', pathOf(child) !== '/pairing', pathOf(child));
    await child.goto(BASE + '/settings', { waitUntil: 'load' });
    await child.waitForTimeout(4000);
    check('child phone: opening Settings lands on the child side', pathOf(child) !== '/settings', pathOf(child));
    await child.goto(BASE + '/profile', { waitUntil: 'load' });
    await T(child, 'What this version does').waitFor({ timeout: 20000 });
    const meText = await text(child);
    check('child phone: no "Switch mode" once in a family', !meText.includes('Switch mode'));
    await shot(child, '10-child-me');

    // ---- parent cannot open the child side ----
    await parent.goto(BASE + '/home', { waitUntil: 'load' });
    await parent.waitForTimeout(4000);
    check('parent phone: opening the child home lands on the parent side', pathOf(parent) !== '/home', pathOf(parent));

    // ---- a request from the child, answered by the parent ----
    await child.goto(BASE + '/requests', { waitUntil: 'load' });
    await waitState(child, () => window.__haven && window.__haven.link.status === 'linked', null, 30000);
    const before = (await state(child)).children[0].limitMin;
    await child.evaluate(() => window.__haven.store.requestExtraTime(30));
    await parent.goto(BASE + '/dashboard', { waitUntil: 'load' });
    await waitState(parent, () => window.__haven && window.__haven.link.status === 'linked' && window.__haven.store.requests.some((r) => r.status === 'pending'), null, 40000);
    await T(parent, '30 more minutes').waitFor({ timeout: 15000 });
    await shot(parent, '11-parent-dashboard-request');
    const dash = await text(parent);
    check('parent dashboard: real family shows the limit and check-in, not battery or place', dash.includes('Daily limit') && dash.includes('No check-in yet') && !dash.includes('Used today'));
    await tap(parent, 'Approve');
    await waitState(child, (limit) => window.__haven.store.children[0].limitMin === limit + 30 && window.__haven.store.requests.some((r) => r.status === 'approved'), before, 40000);
    check('request: approved by the parent, 30 minutes added once on the child', (await state(child)).children[0].limitMin === before + 30);

    // ---- SOS wording on the child, and the parent's banner ----
    await child.goto(BASE + '/sos', { waitUntil: 'load' });
    await T(child, 'Emergency SOS').waitFor({ timeout: 20000 });
    const sosText = await text(child);
    check('child SOS screen: does not claim that a location is shared', sosText.includes('does not share your location') && !sosText.includes('shares your live location'));
    await shot(child, '12-child-sos');

    // ---- members list and removal ----
    await parent.goto(BASE + '/pairing', { waitUntil: 'load' });
    await T(parent, 'In this family').waitFor({ timeout: 20000 });
    await waitState(parent, () => window.__haven.link.members.length === 2, null, 30000);
    await shot(parent, '13-parent-members');
    const removeButtons = B(parent, /^Remove /);
    check('parent: exactly one member can be removed (not the founder, not this account)', (await removeButtons.count()) === 1, String(await removeButtons.count()));
    await removeButtons.first().click();
    await B(parent, 'Remove').click();
    await waitState(child, () => window.__haven.link.status === 'removed' && window.__haven.store.live === false, null, 40000);
    cs = await state(child);
    check('child: removed by the parent -> says so, sample data again, no role', cs.status === 'removed' && cs.role === null && cs.children.length > 1, JSON.stringify({ status: cs.status, kids: cs.children.length }));
    const members = await serverDocs(`families`);
    check('server: one family document', members.length === 1, String(members.length));
    await shot(child, '14-child-removed');

    // ---- parent signs out (settings) and in again ----
    await parent.goto(BASE + '/settings', { waitUntil: 'load' });
    await T(parent, 'Sign out').waitFor({ timeout: 20000 });
    await T(parent, 'Sign out').click();
    await B(parent, 'Sign out').last().click();
    await waitState(parent, () => window.__haven.link.status === 'signed-out' && window.__haven.store.live === false, null, 30000);
    await B(parent, "I'm a parent").waitFor({ timeout: 20000 });
    s = await state(parent);
    check('parent: signing out returns to the chooser with sample data', s.role === null && s.children.length > 1 && s.storeRole === null, JSON.stringify({ role: s.role, kids: s.children.length }));
    const saved = await parent.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + (localStorage.getItem(k) || '').length));
    const leak = await parent.evaluate(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes('Aisha') || (localStorage.getItem(k) || '').includes('Test family')));
    check('parent: nothing of the family is left in this browser after sign-out', !leak, saved.join(' '));

    await B(parent, "I'm a parent").click();
    await parent.waitForURL('**/account', { timeout: 15000 });
    await L(parent, 'Email').fill('owner@example.com');
    await L(parent, 'Password').fill('wrong password');
    await B(parent, 'Sign in').last().click();
    await T(parent, "That didn't work").waitFor({ timeout: 20000 });
    check('parent: a wrong password is refused with a message', (await text(parent)).toLowerCase().includes('password'));
    await L(parent, 'Password').fill('correct horse battery');
    await B(parent, 'Sign in').last().click();
    await waitState(parent, () => window.__haven.link.status === 'linked' && window.__haven.store.children.length === 1 && window.__haven.store.children[0].name === 'Aisha', null, 40000);
    s = await state(parent);
    check('parent: signing in again brings the family back without a code', s.role === 'parent' && s.family === 'Test family' && s.children[0].limitMin === before + 30, JSON.stringify(s.children));
    await shot(parent, '15-parent-back');
  } catch (e) {
    check('script ran to the end', false, String(e).slice(0, 400));
    await shot(parent, 'zz-parent-at-failure').catch(() => {});
    await shot(child, 'zz-child-at-failure').catch(() => {});
    console.log('parent url', parent.url(), 'child url', child.url());
    console.log('parent state', JSON.stringify(await state(parent).catch(() => null)));
    console.log('child state', JSON.stringify(await state(child).catch(() => null)));
  }

  const benign = (m) => /Failed to load resource|net::ERR|permission-denied|Missing or insufficient permissions|400 \(Bad Request\)|Could not reach Cloud Firestore/.test(m);
  const bad = { parent: errors.parent.filter((m) => !benign(m)), child: errors.child.filter((m) => !benign(m)) };
  check('no unexpected console errors', bad.parent.length === 0 && bad.child.length === 0, JSON.stringify(bad).slice(0, 600));
  console.log('console errors seen (incl. expected refusals): parent', errors.parent.length, 'child', errors.child.length);
  await browser.close();
  server.close();
  console.log(failed === 0 ? `E2E PASSED (${results.length} checks)` : `E2E FAILED: ${failed} of ${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
})();
