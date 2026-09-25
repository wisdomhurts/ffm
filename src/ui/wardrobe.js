// Wardrobe: character customization. OWNER: looks agent (docs/ONLINE.md). openWardrobe(app).
import { comingSoon } from './comingSoon.js';
export const openWardrobe = (app) => comingSoon(app, 'Wardrobe');
// In-game boutique stand: same panel inside a shop modal. Returns {el, title, dispose}.
export function buildWardrobe() { return { el: document.createElement('div'), title: 'Wardrobe', dispose() {} }; }
