// Placeholder panel used by feature entry points that aren't built yet.
import { h } from './dom.js';

export function comingSoon(app, title) {
  const body = h('div', { class: 'soon' }, h('h2', { text: title }), h('p', { text: 'Coming soon!' }));
  return app.menus.openModal(body, { cls: 'soon-modal', label: title });
}
