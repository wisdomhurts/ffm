// Online lobby UI. OWNER: net agent (docs/ONLINE.md). openLobby(app) + mountRoomPanel(app, hudRoot).
import { comingSoon } from './comingSoon.js';
export const openLobby = (app) => comingSoon(app, 'Play Online');
export function mountRoomPanel() { return { update() {}, dispose() {} }; }
