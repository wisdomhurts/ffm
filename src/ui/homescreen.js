// "Play full screen on iPhone": the Home Screen guide the full screen buttons open on iPhones (see
// ui/fullscreen.js, mode 'home'). Safari can't hide its bars for a page, but a game added to the Home Screen
// opens from its own icon with the whole screen to itself.
import { h } from './dom.js';
import { ICON } from './icons.js';
import { appIconSvg } from './appIcon.js';

// iOS's own Share glyph (a box with an arrow out of the top) and the "Add to Home Screen" plus box
const SHARE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14.5V3M8 6.8L12 3l4 3.8"/><path d="M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5h-2"/></g></svg>';
const ADD = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/></g></svg>';

const STEPS = [
  [SHARE, 'Tap Share', "In Safari it's in the bottom bar (tap ••• first if you don't see it). In Chrome it's at the top."],
  [ADD, 'Tap “Add to Home Screen”', 'Scroll down the list to find it. Keep “Open as Web App” on, then tap Add.'],
  [null, 'Open Steal A Seed from your Home Screen', 'No bars, no address box: the whole screen is the game!'],
];

export function buildHomeScreenGuide() {
  const icon = (cls) => h('span', { class: cls, html: appIconSvg(1) });
  return h('div', { class: 'fsh' },
    h('div', { class: 'fsh-head' },
      icon('fsh-app'),
      h('div', {},
        h('h2', { text: 'Play full screen' }),
        h('p', { class: 'fsh-sub', text: 'iPhones only hide Safari’s bars for games on the Home Screen. It takes ten seconds:' }))),
    h('ol', { class: 'fsh-steps' }, STEPS.map(([ic, title, text], i) =>
      h('li', { class: 'fsh-step' },
        h('span', { class: 'fsh-n', text: String(i + 1) }),
        ic ? h('span', { class: 'fsh-ic', html: ic }) : icon('fsh-ic fsh-mini'),
        h('div', { class: 'fsh-copy' }, h('b', { text: title }), h('span', { text }))))),
    h('p', { class: 'fsh-note', html: `<span class="bi">${ICON.help}</span><span>The Home Screen game keeps its own save, separate from the one in Safari.</span>` }));
}
