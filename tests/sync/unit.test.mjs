// The unit cases for the sync core: ids, labels, the schema table and its codecs, the reconcile,
// the single documents, the store's loader. Each `cases/*.cases.ts` exports a list of cases.
//
//   node --import ./tests/sync/register.mjs --test tests/sync/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const files = ['ids', 'labels', 'schema', 'reconcile', 'single', 'persist', 'scenarios'];

for (const file of files) {
  let cases = [];
  try {
    ({ cases } = await import(`./cases/${file}.cases.ts`));
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
  test(file, async (t) => {
    for (const c of cases) await t.test(c.name, () => c.run(assert));
  });
}
