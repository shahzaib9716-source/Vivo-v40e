import {
  collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query,
  runTransaction, serverTimestamp, startAfter, where,
} from 'firebase/firestore';
import type { Firestore, Timestamp } from 'firebase/firestore';
import { matchingTerms, wordMatchers } from './activityImport';

export const chatWordRef = (db: Firestore, family: string) => doc(db, 'families', family, 'settings', 'chatWords');

export function parseWords(input: string) {
  const terms = [...new Set(input.split(/[,\n]/).map(s => s.trim().toLowerCase()).filter(Boolean))];
  if (terms.length > 30 || terms.some(term => term.length > 80)) throw Error('Use up to 30 words or phrases of up to 80 characters each.');
  return terms;
}

export async function scanChatPage(db: Firestore, family: string, child: string, uid: string) {
  const base = doc(db, 'families', family, 'children', child);
  const settings = chatWordRef(db, family);
  const cursor = doc(base, 'settings', 'chatWordCursor');
  const [config, saved] = await Promise.all([getDocFromServer(settings), getDocFromServer(cursor)]);
  const terms: unknown = config.get('terms');
  const since = config.get('since') as Timestamp | undefined;
  const version = config.get('version');
  if (!since || typeof version !== 'string' || !Array.isArray(terms) || !terms.length) return false;
  const patterns = wordMatchers(terms.filter((s): s is string => typeof s === 'string').join(','), true);
  if (!patterns.length) return false;
  const resume = saved.get('version') === version;
  const messages = collection(base, 'messages');
  const page = await getDocsFromServer(query(messages, where('at', '>=', since), orderBy('at'), orderBy(documentId()),
    ...(resume ? [startAfter(saved.get('at'), saved.get('message'))] : []), limit(12)));
  if (page.empty) return false;
  return runTransaction(db, async tx => {
    const [current, checkpoint] = await Promise.all([tx.get(settings), tx.get(cursor)]);
    if (current.get('version') !== version) return false;
    if (checkpoint.get('version') !== saved.get('version') || checkpoint.get('message') !== saved.get('message')) return true;
    for (const msg of page.docs) {
      if (msg.get('from') !== 'child' || typeof msg.get('text') !== 'string') continue;
      const found = matchingTerms(msg.get('text'), patterns);
      if (!found.length) continue;
      tx.set(doc(collection(db, 'families', family, 'alerts')), {
        kind: 'word', childId: child, icon: 'bell', color: '#C2410C', title: 'Word alert in Haven chat',
        body: ('Matched ' + found.join(', ')).slice(0, 240), unread: true, at: serverTimestamp(), by: uid,
      });
    }
    const last = page.docs[page.size - 1];
    tx.set(cursor, { version, at: last.get('at'), message: last.id });
    return page.size === 12;
  });
}
