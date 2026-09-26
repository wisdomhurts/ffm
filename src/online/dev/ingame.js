// Dev build of the real game with the cloud sync attached and the panels exposed (until main.js wires
// them in). node build.mjs --entry src/online/dev/ingame.js --out <dir>; see tests/online/ingame-check.mjs.
import '../../main.js';
import { openLeaderboard } from '../../ui/leaderboard.js';
import { openCloudSave } from '../../ui/cloudsave.js';
import { attachCloudSync } from '../sync.js';
import * as profiles from '../../core/profiles.js';
import * as api from '../api.js';
import * as rpc from '../rpc.js';

(function ready() {
  const app = window.__app;
  if (!app) return setTimeout(ready, 30);
  app.cloudSync = attachCloudSync(app);
  window.__sas = { app, openLeaderboard, openCloudSave, profiles, api, rpc };
})();
