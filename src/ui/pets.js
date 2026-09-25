// Pets inventory + egg shop UI. OWNER: pets agent (docs/ONLINE.md). openPets(app), buildPetShop(app, close).
import { comingSoon } from './comingSoon.js';
export const openPets = (app) => comingSoon(app, 'Pets');
export function buildPetShop() { return { el: document.createElement('div'), title: 'Pet Eggs', dispose() {} }; }
