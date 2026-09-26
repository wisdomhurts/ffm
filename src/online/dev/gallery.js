// Dev page for the High Scores + Cloud Save panels without the 3D game (fast to screenshot).
//   node build.mjs --entry src/online/dev/gallery.js --out <dir>
// Point it at a backend first with window.__SAS_ONLINE__ = {url, key} (tests/online/ui-check.mjs routes
// that URL to the in-memory fake). window.__sas exposes the pieces for scripted checks.
import { injectStyles } from '../../ui/styles.js';
import { createMenus } from '../../ui/menus.js';
import { openLeaderboard } from '../../ui/leaderboard.js';
import { openCloudSave } from '../../ui/cloudsave.js';
import { bus } from '../../core/events.js';
import * as profiles from '../../core/profiles.js';
import * as api from '../api.js';
import * as rpc from '../rpc.js';
import { attachCloudSync } from '../sync.js';

injectStyles();
document.body.style.background = 'radial-gradient(ellipse at 30% 20%,#7fd3ff,#3a8fd6 45%,#2f7a3a 46%,#3fa64b 70%,#2b6b32)';
const container = document.getElementById('app') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'app' }));
const root = document.createElement('div');
root.id = 'ui';
container.appendChild(root);

const app = {
  root,
  bus,
  audio: null,
  input: { take() {}, reset() {}, enabled: true },
  touch: { setVisible() {} },
  state: 'title',
  game: null,
  human: null,
  online: null,
  profileId: profiles.activeProfileId() || 'maddie',
  get profile() {
    return profiles.getProfile(this.profileId) || profiles.getProfile('dorian');
  },
  setProfile(id) {
    if (!profiles.getProfile(id)) return;
    this.profileId = id;
    profiles.setActiveProfile(id);
    bus.emit('profile:active', { profile: this.profile });
  },
  hasSave: () => false,
  startGame() {},
  quitToTitle() {},
};
app.menus = createMenus(app);
app.cloudSync = attachCloudSync(app);
window.__app = app;
window.__sas = { app, openLeaderboard, openCloudSave, profiles, api, rpc };
