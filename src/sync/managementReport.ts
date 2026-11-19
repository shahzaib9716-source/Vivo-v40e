import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './remote';

const latest = (family: string, child: string) => doc(db(), 'families', family, 'children', child, 'management', 'latest');

export function publishManagement(family: string, child: string, uid: string, message: string) {
  return runTransaction(db(), async tx => {
    tx.set(latest(family, child), { by: uid, message, receivedAt: serverTimestamp() });
  });
}

export function listenManagement(family: string, child: string, update: (status: string) => void) {
  return onSnapshot(latest(family, child), { includeMetadataChanges: true }, snap => {
    const report = snap.data();
    const when = report?.receivedAt?.toDate?.();
    if (!when || typeof report?.message !== 'string') {
      update(snap.metadata.fromCache ? 'Waiting for device status…' : 'No device enforcement status received.');
      return;
    }
    update((snap.metadata.fromCache ? 'Cached device check' : 'Last device check') + ' · ' + when.toLocaleString() + ' · ' + report.message);
  }, () => update('Device status unavailable.'));
}
