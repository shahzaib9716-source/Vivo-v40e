import {
  collection, doc, getDocsFromServer, limit, query, runTransaction, where, writeBatch,
} from 'firebase/firestore';
import type { DocumentReference, Firestore, Query } from 'firebase/firestore';

export async function deleteProfile(db: Firestore, family: string, child: string) {
  const base = doc(db, 'families', family);
  const profile = doc(base, 'children', child);
  await runTransaction(db, async tx => {
    const current = await tx.get(profile);
    if (!current.exists()) throw Error('This profile no longer exists.');
    if (current.get('retired') === true) return;
    tx.set(profile, { retired: true, pending: true });
  });
}

async function drain(db: Firestore, source: Query) {
  const page = query(source, limit(100));
  for (;;) {
    const records = await getDocsFromServer(page);
    if (records.empty) return;
    const batch = writeBatch(db);
    for (const record of records.docs) batch.delete(record.ref);
    await batch.commit();
  }
}

function denied(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';
}

async function removeEnrollment(db: Firestore, family: DocumentReference, child: string, member: DocumentReference) {
  const uid = member.id;
  const devices = query(collection(family, 'devices'), where('uid', '==', uid));
  for (;;) {
    const page = await getDocsFromServer(query(devices, limit(8)));
    if (page.empty) break;
    const sameEnrollment = await runTransaction(db, async tx => {
      const current = await tx.get(member);
      if (current.get('role') !== 'child' || current.get('childId') !== child) return false;
      const records = await Promise.all(page.docs.map(record => tx.get(record.ref)));
      for (const record of records) if (record.exists() && record.get('uid') === uid) tx.delete(record.ref);
      return true;
    });
    if (!sameEnrollment) return;
  }

  const enrolled = await runTransaction(db, tx => tx.get(member));
  const code = enrolled.get('code');
  if (enrolled.get('childId') === child && typeof code === 'string') {
    try {
      await runTransaction(db, async tx => {
        const invitation = doc(db, 'pairing', code);
        const record = await tx.get(invitation);
        if (record.get('familyId') === family.id && record.get('claimedBy') === uid && record.get('approved') === true) {
          tx.delete(invitation);
        }
      });
    } catch (error) {
      // A consumed code is normally gone. Its reuse by another family also denies the read.
      if (!denied(error)) throw error;
    }
  }

  async function unlink(withPointer: boolean) {
    await runTransaction(db, async tx => {
      const enrollment = await tx.get(member);
      if (enrollment.get('role') !== 'child' || enrollment.get('childId') !== child) return;
      if (withPointer) tx.delete(doc(db, 'users', uid));
      tx.delete(member);
    });
  }
  try { await unlink(true); }
  catch (error) {
    // An absent pointer or one owned by a different family cannot be deleted here.
    if (!denied(error)) throw error;
    await unlink(false);
  }
}

export async function finishProfileDeletion(db: Firestore, family: string, child: string) {
  const base = doc(db, 'families', family);
  const profile = doc(base, 'children', child);
  const stillPending = await runTransaction(db, async tx => (await tx.get(profile)).get('pending') === true);
  if (!stillPending) return;

  const enrolled = query(collection(base, 'members'), where('childId', '==', child));
  for (const member of (await getDocsFromServer(enrolled)).docs) {
    await removeEnrollment(db, base, child, member.ref);
  }
  for (const group of ['live', 'settings', 'packageRules', 'unlock', 'photos', 'location',
    'checkins', 'management', 'usage', 'requests', 'messages', 'voice', 'tripPoints', 'checkinRequests', 'callStatus']) {
    await drain(db, collection(profile, group));
  }
  await drain(db, query(collection(base, 'alerts'), where('childId', '==', child)));
  await runTransaction(db, async tx => {
    const sos = doc(base, 'signals', 'sos');
    const signal = await tx.get(sos);
    if (signal.get('childId') === child) tx.delete(sos);
    tx.set(profile, { retired: true, pending: false });
  });
}
