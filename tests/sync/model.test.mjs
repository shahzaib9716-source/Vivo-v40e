// The randomised model: two to four phones and a fake server, random histories with late
// snapshots, restarts, offline periods and kills. See model/world.ts for what is checked.
//
//   node --import ./tests/sync/register.mjs --test tests/sync/model.test.mjs
//   SEEDS=20000 SEED_FROM=1 node --import ./tests/sync/register.mjs --test tests/sync/model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { optionsForSeed, runModel } from './model/world.ts';

const seeds = Number(process.env.SEEDS ?? 5000);
const from = Number(process.env.SEED_FROM ?? 1);

test(`model: ${seeds} random histories, seeds ${from} to ${from + seeds - 1}`, () => {
  const total = { events: 0, writes: 0, budget: 0, kills: 0, refusedByRace: 0, resent: 0, reverted: 0, maxPasses: 0, withKills: 0, withOffline: 0, devices: 0 };
  for (let seed = from; seed < from + seeds; seed++) {
    const options = optionsForSeed(seed);
    let report;
    try {
      report = runModel(assert, options);
    } catch (error) {
      error.message = `seed ${seed} (${JSON.stringify(options)}): ${error.message}`;
      throw error;
    }
    total.events += report.events;
    total.writes += report.writes;
    total.budget += report.budget;
    total.kills += report.kills;
    total.refusedByRace += report.refusedByRace;
    total.reverted += report.reverted;
    total.resent += report.resent;
    total.maxPasses = Math.max(total.maxPasses, report.maxPasses);
    total.devices += report.devices;
    if (options.kills) total.withKills += 1;
    if (options.offline) total.withOffline += 1;
  }
  console.log(`model: ${seeds} seeds, 0 failures; ${JSON.stringify(total)}`);
});
