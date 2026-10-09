// Chat panel: typed chat + the quick-chat phrases as chips. mountChat(app, hudRoot, {tl}) -> {update, dispose,
// open, close, send}. The rules (filter, rate limits, where typing is allowed) live in social/chat.js.
//
// Desktop: Enter opens it with the cursor in the box, Enter sends (and closes), Esc closes; while typing no
// game key fires (core/input.js and the other widgets skip key presses aimed at an input). T stays quick chat.
// Touch: the chat button (over the emote button on portrait phones) opens it at the TOP of the screen with the
// input first, so the on-screen keyboard never covers it. The log keeps the last TEXT_CHAT.history lines (bot lines, quick chat and typed),
// names in their colours. In online rooms the people row mutes someone's chat (and emotes) on this device.
import { TEXT_CHAT } from '../config.js';
import { bus } from '../core/events.js';
import { h, noFocus, uiSound } from './dom.js';
import { ICON } from './icons.js';
import { avatarEl } from './avatars.js';
import { isTouch } from './device.js';
import { QUICK_CHAT, SAY_COOLDOWN } from '../social/catalog.js';
import { socialUi } from '../social/uiState.js';
import { CHAT_NOTES, sendTyped, typedChatAllowed, typedChatBlock, roomIsPrivate, grownUpQuestion } from '../social/chat.js';
import { injectChatStyles } from '../social/chatStyles.js';
import { isCelebrating } from '../progress/celebrate.js';

const SEND = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 11.3L20.3 4l-6.6 16.4-2.4-6.6z" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M11.3 13.8L20.3 4" fill="none" stroke="#2a6fe6" stroke-width="1.6"/></svg>';
const NOTE_MS = 3800;

const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

// The chat buttons act on the pointer itself, not on `click`: browsers never synthesise a click for a second
// finger while the thumb is on the joystick. Same pattern as ui/hud.js onPress(..., 'up'); keyboard activation
// (a click with detail 0) still works.
function onTap(el, fn) {
  let armed = null;
  let firedAt = -1e9; // the click that trails a tap can also report detail 0: it must not fire again
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    armed = e.pointerId;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointers can't be captured */
    }
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== armed) return;
    armed = null;
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) {
      firedAt = performance.now();
      fn(e);
    }
  });
  el.addEventListener('pointercancel', () => (armed = null));
  el.addEventListener('click', (e) => e.detail === 0 && performance.now() - firedAt > 600 && fn(e));
}

/**
 * Grown-ups only: a quick sum before typed chat in public rooms is switched on (Settings > Chat). Opens a small
 * modal over Settings; `onPass` runs only for the right answer. Cancel, Esc or a wrong answer change nothing.
 */
export function askGrownUp(app, onPass) {
  if (typeof document === 'undefined' || !app?.menus?.openModal) return;
  injectChatStyles();
  const q = grownUpQuestion();
  const input = h('input', {
    class: 'gu-in', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'off', 'aria-label': `What is ${q.text}?`,
  });
  const cancel = h('button', { class: 'btn btn-grey', type: 'button', text: 'Cancel' });
  const ok = h('button', { class: 'btn btn-green', type: 'submit', text: 'OK' });
  const form = h('form', { class: 'gu-form', autocomplete: 'off' },
    h('div', { class: 'gu-q' }, h('span', { text: `${q.text} =` }), input), h('div', { class: 'gu-btns' }, cancel, ok));
  const body = h('div', { class: 'gu-body' },
    h('div', { class: 'mh' }, h('span', { class: 'mh-ic', html: ICON.lock }), h('h2', { text: 'Grown-ups only' })),
    h('p', { class: 'gu-p', text: 'Typed chat in public rooms lets your child type to people they don\'t know. To switch it on, answer this:' }),
    form);
  const m = app.menus.openModal(body, { cls: 'grown-up', label: 'Grown-ups only' });
  cancel.addEventListener('click', () => {
    uiSound(app, 'click');
    m.close();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const right = input.value.trim() !== '' && Number(input.value.trim()) === q.answer;
    uiSound(app, right ? 'click' : 'error');
    m.close();
    if (right) onPass();
  });
  if (!isTouch()) setTimeout(() => input.isConnected && input.focus({ preventScroll: true }), 60);
}

export function mountChat(app, hudRoot, parts = {}) {
  const me = app.human;
  if (!app.game || !me || !hudRoot) return { update() {}, dispose() {} };
  injectChatStyles();
  const game = app.game;
  const on = () => app.online;

  // ---------------------------------------------------------------- buttons: one in the Pause/Mute row (desktop, phones
  // on their side), a round one by the emote button on portrait phones (that row is full there; CSS picks)
  const dot = h('b', { class: 'cdot' });
  const hbtn = noFocus(h('button', { class: 'hbtn chat-hbtn', type: 'button', 'aria-label': 'Chat', 'aria-expanded': 'false', title: 'Chat (Enter)', html: ICON.chat }, dot));
  (parts.tl?.querySelector('.hud-btns') || parts.tl || hudRoot).appendChild(hbtn);
  const tdot = h('b', { class: 'cdot' });
  const tbtn = h('button', { class: 'chat-tbtn', type: 'button', 'aria-label': 'Chat', 'aria-expanded': 'false', html: ICON.chat }, tdot);
  hudRoot.appendChild(tbtn);
  const btns = [hbtn, tbtn];

  // ---------------------------------------------------------------- panel
  const where = h('span', { class: 'cp-where' });
  const xBtn = noFocus(h('button', { class: 'hbtn cp-x', type: 'button', 'aria-label': 'Close chat', html: ICON.close }));
  const head = h('div', { class: 'cp-head' }, h('span', { class: 'cp-ic', html: ICON.chat }), h('b', { class: 'cp-title', text: 'Chat' }), where, xBtn);
  const people = h('div', { class: 'cp-people', role: 'group', 'aria-label': 'Mute someone' });
  const logEl = h('div', { class: 'cp-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Chat messages' });
  const input = h('input', {
    class: 'cp-in', type: 'text', maxlength: String(TEXT_CHAT.maxLen), placeholder: 'Say something nice…', 'aria-label': 'Type a message',
    autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'true', enterkeyhint: 'send',
  });
  const sendBtn = h('button', { class: 'btn btn-blue cp-send', type: 'submit', 'aria-label': 'Send' },
    h('span', { class: 'bi', html: SEND }), h('span', { class: 'cs-t', text: 'Send' }));
  const form = h('form', { class: 'cp-form', autocomplete: 'off' }, input, sendBtn);
  const note = h('span', { class: 'cp-note', 'aria-live': 'polite' });
  const count = h('span', { class: 'cp-count' });
  const meta = h('div', { class: 'cp-meta' }, note, count);
  const offBox = h('div', { class: 'cp-off', hidden: true });
  const chips = QUICK_CHAT.map((q) => {
    const b = h('button', { class: 'cp-q', type: 'button', 'data-id': q.id, html: q.icon || '' });
    b.appendChild(h('span', { text: q.text }));
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor in the box
    b.addEventListener('click', () => quick(q.id, b));
    return b;
  });
  const quickRow = h('div', { class: 'cp-quick', role: 'group', 'aria-label': 'Quick chat' }, chips);
  const panel = h('div', { class: 'chat-panel', role: 'dialog', 'aria-label': 'Chat' }, head, people, logEl, form, meta, offBox, quickRow);

  let open = false;
  let unread = 0;
  let noteTimer = 0;
  let closeTimer = 0;
  let lastSayAt = -1e9;
  const log = []; // {slot, pid, name, color, text, q, me, typed}

  // not over a full-screen moment either (Family Four celebration, pet hatch): Enter belongs to its buttons
  const canOpen = () => app.state === 'playing' && app.game === game && !socialUi.sheet && !socialUi.wheel && !app.menus?.isBlocking?.() && (app.cam?.introT ?? 1) >= 1 &&
    !isCelebrating() && !document.querySelector('.pet-hatch');

  function setNote(text, warn = false) {
    clearTimeout(noteTimer);
    note.textContent = text || '';
    note.classList.toggle('warn', !!warn);
    if (text) noteTimer = setTimeout(() => setNote(''), NOTE_MS);
  }

  function paintCount() {
    const n = [...input.value].length;
    count.textContent = n >= TEXT_CHAT.maxLen - 20 ? `${n}/${TEXT_CHAT.maxLen}` : '';
    count.classList.toggle('full', n >= TEXT_CHAT.maxLen);
  }

  // where we are and whether typing works here
  function paintMode() {
    const room = on()?.room;
    const priv = roomIsPrivate(room);
    where.innerHTML = room ? (priv ? ICON.lock : ICON.globe) : ICON.user;
    where.appendChild(document.createTextNode(room ? (priv ? 'Private room' : 'Public room') : 'Solo game'));
    const block = typedChatBlock(on());
    form.hidden = !!block;
    meta.hidden = !!block;
    offBox.hidden = !block;
    if (block) offBox.innerHTML = `${ICON.help}<span>${CHAT_NOTES[block]}</span>`;
    if (block && document.activeElement === input) input.blur();
  }

  function paintPeople() {
    const ms = (on()?.room ? on().members || [] : []).filter((m) => !m.isMe);
    people.hidden = !ms.length;
    if (!ms.length) return people.replaceChildren();
    people.replaceChildren(h('span', { text: 'Mute' }), ...ms.map((m) => {
      const b = h('button', {
        class: 'cp-pm' + (m.muted ? ' muted' : ''), type: 'button', style: `--c:${m.color}`, 'aria-pressed': String(!!m.muted),
        'aria-label': m.muted ? `Unmute ${m.name}` : `Mute ${m.name}`, title: m.muted ? 'Unmute' : 'Mute chat',
      }, avatarEl(m.faceKey, ''), h('span', { text: m.name }), h('i', { html: m.muted ? ICON.soundOff : ICON.chat }));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        uiSound(app, 'click');
        on()?.mute?.(m.pid);
        setNote(m.muted ? `${m.name}'s chat is back.` : `Muted ${m.name}. Only you can tell.`);
        renderLog();
      });
      return b;
    }));
  }

  const muted = (x) => !!x.pid && !!on()?.isMuted?.(x.pid);

  function lineEl(x) {
    return h('div', { class: 'cp-l' + (x.q ? ' q' : '') + (x.me ? ' me' : '') }, h('b', { style: `--c:${x.color}`, text: x.name }), ': ', h('span', { text: x.text }));
  }

  // typed lines only while typed chat is allowed here (switching it off hides the ones already in the log)
  const visible = (x) => !muted(x) && (!x.typed || typedChatAllowed(on()));

  function renderLog() {
    const shown = log.filter(visible);
    if (!shown.length) {
      logEl.replaceChildren(h('div', { class: 'cp-empty', text: typedChatAllowed(on()) ? 'No messages yet. Say hi!' : 'Tap a quick chat below to say hi!' }));
      return;
    }
    logEl.replaceChildren(...shown.map(lineEl));
    logEl.scrollTop = logEl.scrollHeight;
  }

  function paintUnread() {
    for (const b of btns) b.classList.toggle('unread', unread > 0);
    dot.textContent = tdot.textContent = unread > 9 ? '9+' : String(unread);
  }

  // every line said in this game, as this device shows it (the HUD chat log follows the same rules)
  const offChat = bus.on('chat', ({ player, text, quick: q, typed } = {}) => {
    if (!player || !text || app.game !== game || game.players[player.slot] !== player) return;
    if (on()?.isMuted?.(player) || (typed && !typedChatAllowed(on()))) return;
    const x = { slot: player.slot, pid: player.pid || null, name: player.name, color: player.char.color, text: String(text), q: !!q, me: player === me, typed: !!typed };
    log.push(x);
    if (log.length > TEXT_CHAT.history) log.shift();
    if (open) {
      if (logEl.querySelector('.cp-empty')) logEl.replaceChildren();
      const stick = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
      logEl.appendChild(lineEl(x));
      while (logEl.children.length > TEXT_CHAT.history) logEl.firstChild.remove();
      if (stick || x.me) logEl.scrollTop = logEl.scrollHeight;
    } else if (!x.me) {
      unread++;
      paintUnread();
    }
  });

  // ---------------------------------------------------------------- open / close / send

  function openPanel(focus = true) {
    if (!open && !canOpen()) return false;
    clearTimeout(closeTimer);
    if (!open) {
      open = true;
      panel.classList.remove('out');
      hudRoot.appendChild(panel);
      hudRoot.classList.add('chat-open');
      for (const b of btns) {
        b.classList.add('on');
        b.setAttribute('aria-expanded', 'true');
      }
      unread = 0;
      paintUnread();
      paintMode();
      paintPeople();
      renderLog();
      paintCount();
      fitViewport();
      uiSound(app, 'click');
    }
    if (focus && !form.hidden) input.focus({ preventScroll: true });
    return true;
  }

  function closePanel(instant = false) {
    if (!open) return;
    open = false;
    if (document.activeElement === input) input.blur();
    hudRoot.classList.remove('chat-open');
    for (const b of btns) {
      b.classList.remove('on');
      b.setAttribute('aria-expanded', 'false');
    }
    panel.classList.add('out');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => panel.remove(), instant ? 0 : 150);
  }

  function send() {
    const raw = input.value;
    if (!raw.trim()) {
      if (!isTouch()) closePanel(); // Enter on an empty box: back to the game
      return false;
    }
    const r = sendTyped(app, raw);
    if (!r.ok) {
      if (r.why === 'empty') return false;
      setNote(CHAT_NOTES[r.why] || CHAT_NOTES.words, true);
      input.classList.remove('bad');
      void input.offsetWidth;
      input.classList.add('bad');
      uiSound(app, 'error');
      if (r.why === 'off' || r.why === 'public') paintMode();
      return false;
    }
    input.value = '';
    paintCount();
    setNote('');
    uiSound(app, 'click');
    if (!isTouch()) closePanel(); // keyboard players go straight back to running (Enter again to chat)
    return true;
  }

  function quick(id, b) {
    if (performance.now() - lastSayAt < SAY_COOLDOWN * 1000) {
      setNote('One sec...');
      uiSound(app, 'error');
      return;
    }
    lastSayAt = performance.now();
    app.act('say', id);
    uiSound(app, 'click');
    b?.blur();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  input.addEventListener('input', () => {
    input.classList.remove('bad');
    paintCount();
  });
  // iOS can leave the page scrolled after its keyboard goes away
  input.addEventListener('blur', () => isTouch() && window.scrollTo?.(0, 0));
  xBtn.addEventListener('click', () => {
    uiSound(app, 'click');
    closePanel();
  });
  for (const b of btns) onTap(b, () => (open ? closePanel() : openPanel(true)));
  tbtn.addEventListener('contextmenu', (e) => e.preventDefault());
  panel.addEventListener('keydown', (e) => e.stopPropagation()); // typing never reaches the game's keys
  panel.addEventListener('contextmenu', (e) => e.stopPropagation());

  // ---------------------------------------------------------------- keys (capture: before the game's)
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const enter = e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter';
    if (open) {
      if ((e.code === 'Escape' || e.key === 'Escape') && (e.target === input || !isTyping(e))) {
        closePanel();
        stop(e);
      } else if (e.target === input) {
        if (enter && !e.isComposing) {
          send();
          stop(e);
        }
      } else if (enter && !e.repeat && !isTyping(e)) {
        openPanel(true);
        stop(e);
      }
      return;
    }
    if (!enter || e.repeat || isTyping(e)) return;
    if (openPanel(true)) stop(e);
  };
  window.addEventListener('keydown', onKey, true);

  // the on-screen keyboard shrinks the visual viewport: keep the panel inside what is visible
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  function fitViewport() {
    if (!vv || !open) return;
    panel.style.setProperty('--cp-vh', vv.height.toFixed(0) + 'px');
    panel.style.setProperty('--cp-top', Math.max(0, vv.offsetTop).toFixed(0) + 'px');
  }
  vv?.addEventListener('resize', fitViewport);
  vv?.addEventListener('scroll', fitViewport);

  const offs = [
    offChat,
    bus.on('settings:changed', ({ key }) => {
      if (key !== 'chatOn' && key !== 'chatPublic') return;
      if (open) {
        paintMode();
        renderLog();
      }
    }),
    bus.on('net:members', () => open && paintPeople()),
    bus.on('net:host', () => open && paintMode()),
  ];

  // Portrait phones: the round button hangs in the right column, level with the bottom stack's pills. When one
  // of them ("STOP MICAH!", the carry pill, a prompt) reaches under it, the button steps up above the pill. So it
  // does over the gold Sell coin (ui/sell.js), which the Simple HUD puts right below it.
  let liftAt = 0;
  let lift = 0;
  const shown = (el) => {
    if (!el.offsetParent) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && +s.opacity > 0.05;
  };
  // where an element sits without its transform (offset* ignore translate / scale: no jiggle while one animates)
  const layoutRect = (el) => {
    const o = el.offsetParent.getBoundingClientRect();
    const left = o.left + el.offsetLeft;
    const top = o.top + el.offsetTop;
    return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight, height: el.offsetHeight };
  };
  const clearPills = () => {
    const now = performance.now();
    if (now - liftAt < 200) return;
    liftAt = now;
    let want = 0;
    if (tbtn.offsetParent) {
      const { left, right, top, bottom } = layoutRect(tbtn);
      const rects = [];
      for (const el of hudRoot.querySelectorAll('.hud-bottom > :not(.hb-row)')) if (shown(el)) rects.push(el.getBoundingClientRect());
      const coin = document.querySelector('.tb-sell.show');
      if (coin?.offsetParent) rects.push(layoutRect(coin));
      for (const r of rects) {
        if (r.height < 2 || r.right <= left || r.left >= right) continue;
        if (r.top < bottom && r.bottom > top) want = Math.max(want, Math.ceil(bottom - r.top + 8));
      }
    }
    if (want !== lift) {
      lift = want;
      tbtn.style.translate = want ? `0 ${-want}px` : '';
    }
  };

  let lastCool = null;
  return {
    update() {
      clearPills();
      if (open && (app.state !== 'playing' || app.game !== game)) closePanel(true);
      if (!open) return;
      const cool = performance.now() - lastSayAt < SAY_COOLDOWN * 1000;
      if (cool !== lastCool) {
        lastCool = cool;
        for (const b of chips) b.classList.toggle('off', cool);
      }
    },
    dispose() {
      closePanel(true);
      clearTimeout(noteTimer);
      clearTimeout(closeTimer);
      window.removeEventListener('keydown', onKey, true);
      vv?.removeEventListener('resize', fitViewport);
      vv?.removeEventListener('scroll', fitViewport);
      for (const f of offs) f();
      panel.remove();
      hbtn.remove();
      tbtn.remove();
      hudRoot.classList.remove('chat-open');
    },
    /** tests / other widgets */
    open: (focus = true) => openPanel(focus),
    close: () => closePanel(true),
    send: (text) => {
      input.value = String(text ?? '');
      return send();
    },
    get isOpen() {
      return open;
    },
  };
}
