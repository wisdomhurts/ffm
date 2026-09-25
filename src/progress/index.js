// Quests, badges, stars and lifetime counters. OWNER: progress agent (docs/ONLINE.md "Progress").
// attachProgress(app) is called once at boot (main.js) and becomes `app.progress`:
//   the tracker API (quests(), claim(i), swap(i), bonus(), claimBonus(), badges(), bests(), stars, ...; see
//   tracker.js) plus the celebration toasts. The HUD chip and the panel live in ui/progress.js.
import { createTracker } from './tracker.js';
import { installProgressUI } from '../ui/progress.js';

export function attachProgress(app) {
  const tracker = createTracker(app);
  let ui = null;
  try {
    ui = installProgressUI(app);
  } catch (e) {
    console.warn('[progress] toasts unavailable', e);
  }
  tracker.toasts = ui?.toasts || null;
  const disposeTracker = tracker.dispose;
  tracker.dispose = () => {
    ui?.dispose();
    disposeTracker();
  };
  return tracker;
}
