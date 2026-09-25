// Quests + badges UI. OWNER: progress agent (docs/ONLINE.md). openProgress(app), mountQuestChip(app, hudRoot).
import { comingSoon } from './comingSoon.js';
export const openProgress = (app) => comingSoon(app, 'Quests & Badges');
export function mountQuestChip() { return { update() {}, dispose() {} }; }
