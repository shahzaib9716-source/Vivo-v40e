"""Exercise two independently installed Haven apps against the local Firebase emulators."""
import json
import re
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET

AUTH = 'http://127.0.0.1:9099'
PROJECT = 'demo-haven'
BASE = 'com.haven.familysafety.'
EMAIL = 'owner@example.test'
PASSWORD = 'HavenLocal1234'


def auth(method, payload):
    url = AUTH + '/identitytoolkit.googleapis.com/v1/accounts:' + method + '?key=demo-key'
    req = urllib.request.Request(url, json.dumps(payload).encode(), {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.load(resp)


def adb(*args):
    return subprocess.check_output(['adb', *args], text=True, timeout=25).strip()


def show(side, path=''):
    package = BASE + side
    if path:
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'haven-' + side + ':///' + path, package)
    else:
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-f', '0x10200000', '-n', package + '/.MainActivity')


def node(pattern, *, edit=False, enabled=False, last_match=False):
    deadline = time.monotonic() + 55
    pattern = re.compile(pattern)
    last = []
    while time.monotonic() < deadline:
        dump = adb('exec-out', 'uiautomator', 'dump', '/dev/tty')
        start, end = dump.find('<hierarchy'), dump.rfind('</hierarchy>')
        if start < 0 or end < start:
            time.sleep(0.4)
            continue
        root = ET.fromstring(dump[start:end + len('</hierarchy>')])
        last = []
        nodes = list(root.iter('node'))
        for el in reversed(nodes) if last_match else nodes:
            attrs = el.attrib
            if edit and attrs['class'] != 'android.widget.EditText':
                continue
            if enabled and attrs.get('enabled') != 'true':
                continue
            for key in ('content-desc', 'text'):
                value = attrs.get(key, '')
                if value:
                    last.append(value)
                match = pattern.fullmatch(value)
                if match and attrs.get('visible-to-user', 'true') == 'true':
                    x1, y1, x2, y2 = map(int, re.findall(r'\d+', attrs['bounds']))
                    if x2 > x1 and y2 > y1:
                        return match, (str((x1 + x2) // 2), str((y1 + y2) // 2))
        time.sleep(0.4)
    raise AssertionError(f'Control {pattern.pattern!r} missing. Last controls: {last[-32:]}')


def tap(pattern, **opts):
    _, pos = node(pattern, enabled=True, **opts)
    adb('shell', 'input', 'tap', *pos)


def fill(pattern, text):
    tap(pattern, edit=True)
    adb('shell', 'input', 'text', text)
    if re.search(r'(mInputShown|mIsInputViewShown)=true', adb('shell', 'dumpsys', 'input_method')):
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')


def run():
    account = auth('signUp', {'email': EMAIL, 'password': PASSWORD, 'returnSecureToken': True})
    auth('sendOobCode', {'requestType': 'VERIFY_EMAIL', 'idToken': account['idToken']})
    with urllib.request.urlopen(f'{AUTH}/emulator/v1/projects/{PROJECT}/oobCodes') as resp:
        code = next(c['oobCode'] for c in json.load(resp)['oobCodes'] if c['email'] == EMAIL)
    auth('update', {'oobCode': code})
    adb('shell', 'wm', 'size', '1080x2400')
    adb('shell', 'wm', 'density', '300')
    adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '0')
    packages = adb('shell', 'pm', 'list', 'packages', '-U', BASE)
    uids = {s: re.search(re.escape(BASE + s) + r' uid:(\d+)', packages)[1] for s in ('parent', 'child')}
    assert uids['parent'] != uids['child'], packages
    show('parent')
    fill('Email', EMAIL)
    fill('Password', PASSWORD)
    tap('Sign in', last_match=True)
    fill('Family name', 'HavenTest')
    fill('Child’s first name', 'Riley')
    tap('Create family')
    node('Your family is ready')
    show('parent', 'pairing')
    tap('A child’s phone(?:,.*)?')
    code = node(r'Pairing code: ((?:[A-Z2-9] ){7}[A-Z2-9])')[0][1].replace(' ', '')
    show('child')
    fill('Pairing code', code)
    tap('Link this phone')
    check = node(r'Check: ([A-Z0-9 ]+)\. .*')[0][1].replace(' ', '')
    assert len(check) == 4
    show('parent')
    fill('The 4 characters shown on the other phone', check)
    tap('Approve')
    node('Done')
    show('child')
    node('Done')
    tap('Done')
    show('child', 'messages')
    fill('Message .+', 'HandsetProof')
    tap('Send message')
    node('You: HandsetProof')
    adb('shell', 'am', 'force-stop', BASE + 'parent')
    show('parent')
    node('.*Riley.*')
    show('parent', 'messages')
    node('Riley: HandsetProof')
    show('child', 'typing-practice')
    fill('Note text', 'SharedNoteProof')
    tap('Preview note')
    node('Private preview')
    tap('Send note to family chat')
    node(r'You: Haven Child · Typed notes · [\s\S]+SharedNoteProof')
    show('parent', 'messages')
    node(r'Riley: Haven Child · Typed notes · [\s\S]+SharedNoteProof')
    print('PASS: distinct Android UIDs, parent login, child pairing, manual approval, family message after parent restart, and child-reviewed typed note delivered.')


if __name__ == '__main__':
    run()
