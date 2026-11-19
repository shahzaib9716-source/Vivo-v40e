import { doc, getDocFromServer, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';

export function decideExtraTime(database: Firestore, family: string, child: string, id: string, parent: string, approve: boolean) {
  const childRef = doc(database, 'families', family, 'children', child);
  const requestRef = doc(childRef, 'requests', id);
  return runTransaction(database, async tx => {
    const request = (await tx.get(requestRef)).data();
    if (!request || request.kind !== 'extra_time') throw Error('This time request is unavailable.');
    if (request.status !== 'pending') return 'Already answered.';
    if (approve) {
      const limit = (await tx.get(childRef)).data()?.limitMin;
      if (!Number.isFinite(limit) || !Number.isInteger(request.minutes) || request.minutes < 1 || request.minutes > 240) {
        throw Error('The request or daily limit is invalid.');
      }
      tx.update(childRef, { limitMin: Math.min(1440, limit + request.minutes), bedtime: false });
    }
    tx.update(requestRef, { status: approve ? 'approved' : 'denied', resolvedBy: parent, resolvedAt: serverTimestamp() });
    return approve ? 'Time request approved.' : 'Time request declined.';
  }).catch(async error => {
    if (error.code === 'permission-denied') {
      const latest = (await getDocFromServer(requestRef)).data();
      if (latest?.status === 'approved' || latest?.status === 'denied') return 'Already answered.';
    }
    throw error;
  });
}
