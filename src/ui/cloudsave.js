// Cloud Save panel (save codes). OWNER: backend agent (docs/ONLINE.md). openCloudSave(app, {code}).
//
//   Your save code:  get one (registers + uploads) -> big code + Copy, last-saved status, Save now,
//                    "show me on the high scores" switch, unlink / delete. If the code was loaded on
//                    another device: get the newer save, or keep this device's garden.
//   Load from a code: type it -> preview (name + stats) -> choose where it goes (replace the matching
//                    player after a side-by-side comparison, or add as a new player) -> done, with Undo.
// Local progress is never overwritten silently: replacing always asks first and keeps a backup.
import { bus } from '../core/events.js';
import { h, money, fmtNum } from './dom.js';
import { ICON } from './icons.js';
import { avatarEl } from './avatars.js';
import {
  cloudState, cloudLink, cloudPush, cloudPeek, cloudPull, cloudReclaim, cloudUnlink, cloudDelete, cloudMeta, restorePlan, restoreCloud,
  undoRestore, setListed, onlineConfigured, onlineReady, OnlineError,
} from '../online/api.js';
import { formatCodeInput, codeProblem, normalizeCode } from '../online/codes.js';
import { injectScoresCss, nameChip, friendlyError, SAS_ICON, colorOf } from './leaderboard.js';

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 90) return 'a minute ago';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 5400) return 'an hour ago';
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 172800) return 'yesterday';
  return `${Math.round(s / 86400)} days ago`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Open the Cloud Save modal for the active profile. opts.code pre-fills "Load from a code". */
export function openCloudSave(app, opts = {}) {
  injectScoresCss();
  const menus = app.menus;
  const btn = menus.btn;
  const il = menus.iconLabel;
  let disposed = false;
  let tick = 0;

  const who = h('div');
  const codeCard = h('section', { class: 'cs-card', 'aria-label': 'Your save code' });
  const loadCard = h('section', { class: 'cs-card', 'aria-label': 'Load from a code' });
  // No backend yet: a friendly "coming soon" card instead of controls that can't work.
  const soon = !onlineConfigured();
  const root = h('div', { class: 'sas-cs-body' },
    h('div', { class: 'mh' }, h('span', { class: 'mh-ic sas-sky', html: SAS_ICON.cloud }), h('h2', { text: 'Cloud Save' })),
    soon ? null : h('p', { class: 'cs-intro', text: 'Playing on another phone or computer? A save code carries your garden, cash, stars and pets there.' }),
    who, soon ? soonCard() : [codeCard, loadCard]);

  function soonCard() {
    const code = app.profile?.cloud?.code;
    return h('section', { class: 'cs-card cs-soon', 'aria-label': 'Cloud saves are coming soon' },
      h('span', { class: 'lm-ic sky', html: SAS_ICON.cloud }),
      h('b', { text: 'Cloud saves are coming soon!' }),
      h('p', { text: "Soon you'll get a save code that carries your garden, stars and pets to another phone or computer." }),
      h('p', { class: 'cs-soon-ok', html: `${ICON.check}<span>Your progress saves by itself right here on this device.</span>` }),
      code ? h('p', { class: 'sas-note' }, 'Keep your code ', h('b', { text: code }), ': it will work again when cloud saves are back.') : null);
  }

  const inGame = () => !!(app.game && app.human && app.state !== 'title') || !!app.online?.room;
  const prof = () => app.profile;

  // ---------------------------------------------------------------- who
  function paintWho() {
    const p = prof();
    who.textContent = '';
    who.appendChild(h('div', { class: 'cs-who', style: `--c:${colorOf(p.base)}` }, avatarEl(p.id, ''), h('span', {}, 'Playing as ', h('b', { text: p.name }))));
  }

  // ---------------------------------------------------------------- your code
  const statusEl = h('div', { class: 'cs-status', role: 'status' });
  function paintStatus(extra = null) {
    const p = prof();
    const meta = cloudMeta(p.id);
    let cls = '';
    let text;
    if (extra?.state === 'saving') {
      cls = 'busy';
      text = 'Saving to the cloud…';
    } else if (extra?.state === 'error') {
      cls = 'bad';
      text = friendlyError({ code: extra.error });
    } else if (!onlineConfigured()) text = 'Cloud saving is switched off right now.';
    else if (!onlineReady()) text = "You're offline. We'll save when you're back.";
    else if (meta.pushedAt) {
      cls = 'ok';
      text = `Saved to the cloud ${ago(meta.pushedAt)}`;
    } else text = 'Not saved to the cloud yet.';
    statusEl.className = 'cs-status ' + cls;
    statusEl.textContent = '';
    statusEl.append(h('i'), h('span', { text }));
  }

  function listedToggle(on, onFlip) {
    const sw = h('button', { class: 'switch' + (on ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': 'Show me on the global high scores' }, h('i'));
    sw.addEventListener('click', () => {
      menus.click();
      const v = !sw.classList.contains('on');
      sw.classList.toggle('on', v);
      sw.setAttribute('aria-checked', String(v));
      onFlip(v);
    });
    return h('div', { class: 'cs-toggle' },
      h('div', { class: 'tl' }, h('b', { text: 'Show me on the high scores' }), h('small', { text: 'Only your name and best scores are shared. Never photos.' })), sw);
  }

  const cardHead = (icon, text, cls = '') => h('h3', { class: 'cs-h ' + cls }, h('span', { class: 'bi', html: icon }), h('span', { text }));
  const errLine = () => h('p', { class: 'sas-err', role: 'alert', hidden: true });
  const showErr = (el, e) => {
    el.textContent = e ? friendlyError(e) : '';
    el.hidden = !e;
  };

  async function busy(b, fn, err) {
    b.disabled = true;
    b.classList.add('sas-busy');
    showErr(err, null);
    try {
      await fn();
    } catch (e) {
      if (!disposed) showErr(err, e);
    } finally {
      b.disabled = false;
      b.classList.remove('sas-busy');
    }
  }

  function paintCode() {
    const p = prof();
    const state = cloudState(p);
    codeCard.textContent = '';
    codeCard.classList.toggle('warn', state === 'moved');
    const err = errLine();

    if (state === 'off') {
      let listed = true;
      const get = btn(il(SAS_ICON.key, 'Get my save code'), 'btn-green btn-lg cs-big', () => busy(get, async () => {
        if (!onlineConfigured()) throw new OnlineError('not_configured');
        await cloudLink(prof(), { listed, app });
        if (!disposed) paintCode();
      }, err), { 'data-autofocus': '' });
      codeCard.append(
        cardHead(SAS_ICON.key, 'Your save code'),
        h('p', { class: 'cs-p', text: `Get a code for ${p.name}. We'll keep ${p.name}'s garden safe in the cloud and save it by itself while you play.` }),
        get, err,
        listedToggle(true, (v) => (listed = v)));
      return;
    }

    if (state === 'moved') {
      const newer = btn(il(SAS_ICON.cloud, 'Get the newer save'), 'btn-blue', () => {
        codeInput.value = p.cloud.code;
        check();
        loadCard.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      });
      const keep = btn(il(ICON.home, "Keep this device's garden"), 'btn-grey', () => {
        confirmBox.hidden = false;
      });
      const confirmBox = h('div', { class: 'cs-confirm soft', hidden: true },
        h('span', { text: `The other device will stop saving to ${p.cloud.code}, and the cloud gets this device's garden.` }),
        h('div', { class: 'cs-row' },
          btn('Yes, use this one', 'btn-green btn-sm', (e) => busy(e.currentTarget, async () => {
            await cloudReclaim(prof(), { app });
            if (!disposed) paintCode();
          }, err)),
          btn('Cancel', 'btn-grey btn-sm', () => (confirmBox.hidden = true))));
      codeCard.append(
        cardHead(SAS_ICON.cloud, 'Your save moved', 'warn'),
        h('p', { class: 'cs-p' }, `${p.name}'s code `, h('b', { text: p.cloud.code }), ' was loaded on another device, so the newest save lives there now. Which garden do you want?'),
        h('div', { class: 'cs-choices' }, newer, keep), confirmBox, err,
        h('div', { class: 'cs-links' }, h('button', { class: 'link', type: 'button', text: 'Unlink this device', onclick: () => { menus.click(); cloudUnlink(prof()); paintCode(); } })));
      return;
    }

    // linked
    const code = p.cloud.code;
    const copyBtn = btn(il(SAS_ICON.copy, 'Copy'), 'btn-blue btn-sm', async () => {
      const ok = await copyText(code);
      copyBtn.lastChild.textContent = ok ? 'Copied!' : 'Select it';
      setTimeout(() => copyBtn.isConnected && (copyBtn.lastChild.textContent = 'Copy'), 1800);
    });
    const saveBtn = btn(il(SAS_ICON.cloud, 'Save now'), 'btn-green btn-sm', () => busy(saveBtn, async () => {
      const r = await cloudPush(prof(), { app });
      if (!r.pushed && !disposed) {
        saveBtn.lastChild.textContent = 'All saved!';
        setTimeout(() => saveBtn.isConnected && (saveBtn.lastChild.textContent = 'Save now'), 1800);
      }
      paintStatus();
    }, err));
    const confirmBox = h('div', { class: 'cs-confirm', hidden: true });
    const askUnlink = () => {
      confirmBox.textContent = '';
      confirmBox.append(
        h('span', { text: `Stop saving ${p.name} to the cloud on this device? The code keeps working on your other devices.` }),
        h('div', { class: 'cs-row' },
          btn('Unlink', 'btn-red btn-sm', () => {
            cloudUnlink(prof());
            paintCode();
          }),
          btn('Cancel', 'btn-grey btn-sm', () => (confirmBox.hidden = true))));
      confirmBox.hidden = false;
    };
    const askDelete = () => {
      confirmBox.textContent = '';
      confirmBox.append(
        h('span', { text: `Delete ${p.name}'s cloud save and high scores forever? The code stops working everywhere. This device keeps its garden.` }),
        h('div', { class: 'cs-row' },
          btn('Delete forever', 'btn-red btn-sm', (e) => busy(e.currentTarget, async () => {
            await cloudDelete(prof());
            if (!disposed) paintCode();
          }, err)),
          btn('Cancel', 'btn-grey btn-sm', () => (confirmBox.hidden = true))));
      confirmBox.hidden = false;
    };
    codeCard.append(
      cardHead(SAS_ICON.key, 'Your save code'),
      h('div', { class: 'cs-packet' },
        h('div', { class: 'cs-pk-top' }, h('span', { class: 'bi', html: ICON.sprout }), h('span', { text: `${p.name}'s save code` })),
        h('div', { class: 'cs-code', 'aria-label': code.split('').join(' '), html: code.replace(/-/g, '<span class="dash">-</span>') })),
      h('p', { class: 'cs-p', text: 'Write it down or snap a picture. On another device, open Cloud Save and type it in. Only share it with family: anyone with the code can load this garden.' }),
      h('div', { class: 'cs-row' }, copyBtn, saveBtn),
      statusEl, err,
      listedToggle(p.cloud.listed !== false, (v) => setListed(prof(), v)),
      confirmBox,
      h('div', { class: 'cs-links' },
        h('button', { class: 'link', type: 'button', text: 'Unlink this device', onclick: () => { menus.click(); askUnlink(); } }),
        h('button', { class: 'link danger', type: 'button', text: 'Delete from the cloud', onclick: () => { menus.click(); askDelete(); } })));
    paintStatus();
  }

  // ---------------------------------------------------------------- load from a code
  const codeInput = h('input', {
    class: 'cs-input', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false',
    maxlength: '20', placeholder: 'SEED-XXXX-XXXX', 'aria-label': 'Save code',
  });
  const checkBtn = btn(il(ICON.check, 'Check'), 'btn-green', () => check());
  const loadErr = errLine();
  const loadHint = h('p', { class: 'sas-note', text: 'Codes look like SEED-7K4Q-9XPM. They never use 0, O, 1 or I.' });
  const result = h('div');

  codeInput.addEventListener('input', () => {
    const pos = codeInput.selectionStart === codeInput.value.length;
    const f = formatCodeInput(codeInput.value);
    if (f !== codeInput.value) codeInput.value = f;
    if (pos) codeInput.setSelectionRange?.(f.length, f.length);
    const prob = codeProblem(f);
    codeInput.classList.toggle('bad', !!prob);
    loadErr.textContent = prob || '';
    loadErr.hidden = !prob;
    if (result.firstChild) result.textContent = '';
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      check();
    }
  });

  function paintLoad() {
    loadCard.textContent = '';
    loadCard.append(
      cardHead(ICON.upload, 'Load from a code', 'load'),
      h('div', { class: 'cs-input-row' }, codeInput, checkBtn),
      loadHint, loadErr, result);
  }

  const statPill = (icon, value, label, cls = '') => h('div', { class: 'cs-stat' }, h('span', { class: 'bi', html: icon }), h('b', { class: cls, text: value }), h('span', { text: label }));

  async function check() {
    const c = normalizeCode(codeInput.value);
    result.textContent = '';
    if (!c) {
      showErr(loadErr, new OnlineError('bad_code'));
      codeInput.classList.add('bad');
      return;
    }
    codeInput.value = c;
    await busy(checkBtn, async () => {
      const peek = await cloudPeek(c);
      if (!disposed) showPreview(peek);
    }, loadErr);
  }

  function showPreview(peek) {
    const s = peek.summary || {};
    const plan = restorePlan(peek, app);
    const t = plan.target;
    result.textContent = '';
    const box = h('div', { class: 'cs-prev' },
      h('div', { class: 'cs-pv-head' }, nameChip(peek.name, peek.base),
        h('div', {}, h('b', { text: peek.name }), h('small', { text: peek.hasSave ? `Saved ${ago(peek.savedAt)}` : 'No garden saved yet' }))),
      h('div', { class: 'cs-stats' },
        statPill(ICON.coin, money(s.netWorth || 0), 'Best worth', 'cash'),
        statPill(ICON.star, fmtNum(s.stars || 0), 'Stars'),
        statPill(ICON.sprout, fmtNum(s.plants || 0), 'Plants'),
        statPill(SAS_ICON.paw, fmtNum(s.pets || 0), 'Pets'),
        statPill(ICON.eye, fmtNum(s.steals || 0), 'Steals'),
        statPill(ICON.reset, fmtNum(s.rebirths || 0), 'Rebirths')));
    const err = errLine();
    const choices = h('div', { class: 'cs-choices' });
    const blocked = t && inGame() && t.id === app.profileId;

    if (blocked) {
      choices.append(
        h('p', { class: 'cs-p', text: `You're playing as ${t.name} right now. Finish up first so this game doesn't save over the one you're loading.` }),
        btn(il(ICON.home, 'Save & quit to title'), 'btn-gold', () => {
          const code = peek.code;
          app.quitToTitle();
          setTimeout(() => openCloudSave(app, { code }), 60);
        }));
    } else if (t && plan.targetHasProgress) {
      const ts = plan.targetSummary || {};
      box.appendChild(h('div', { class: 'cs-vs' },
        h('div', { class: 'side' }, h('small', { text: 'On this device' }), h('b', { text: t.name }), h('em', { text: `${money(ts.netWorth || 0)} · ${fmtNum(ts.stars || 0)} stars` })),
        h('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }),
        h('div', { class: 'side new' }, h('small', { text: 'From the code' }), h('b', { text: peek.name }), h('em', { text: `${money(s.netWorth || 0)} · ${fmtNum(s.stars || 0)} stars` }))));
      choices.append(
        h('p', { class: 'cs-p' }, 'This replaces ', h('b', { text: `${t.name}'s progress on this device` }), plan.targetOtherCode ? ` (and its code ${plan.targetOtherCode})` : '', '. We keep a backup, so you can undo.'),
        btn(il(SAS_ICON.cloud, `Replace ${t.name}`), 'btn-gold', (e) => restore(e.currentTarget, peek.code, t.id, err)),
        btn(il(ICON.family, 'Add as a new player'), 'btn-blue', (e) => restore(e.currentTarget, peek.code, null, err)));
    } else if (t) {
      choices.append(btn(il(SAS_ICON.cloud, `Load into ${t.name}`), 'btn-green btn-lg', (e) => restore(e.currentTarget, peek.code, t.id, err)));
    } else {
      choices.append(btn(il(ICON.family, `Add ${peek.name} to this device`), 'btn-green btn-lg', (e) => restore(e.currentTarget, peek.code, null, err)));
    }
    box.append(choices, err);
    result.appendChild(box);
    box.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }

  function restore(b, code, into, err) {
    return busy(b, async () => {
      const pulled = await cloudPull(code);
      const res = restoreCloud(pulled, { into });
      if (!disposed) showDone(res);
    }, err);
  }

  function showDone(res) {
    const p = res.profile;
    result.textContent = '';
    codeInput.value = '';
    const undo = res.replaced ? btn(il(ICON.reset, 'Undo'), 'btn-grey', () => {
      const back = undoRestore();
      result.textContent = '';
      if (back) result.appendChild(h('div', { class: 'cs-done' }, h('b', { text: 'Undone!' }), h('p', { text: `${back.name} is back the way it was on this device.` })));
      paintWho();
      paintCode();
    }) : null;
    const go = btn(il(ICON.play, inGame() ? 'Done' : `Play as ${p.name}`), 'btn-green btn-lg', () => {
      if (!inGame() && typeof app.setProfile === 'function') {
        app.setProfile(p.id);
        m.close();
        if (app.state === 'title') app.menus.showTitle?.();
      } else m.close();
    });
    result.appendChild(h('div', { class: 'cs-done' },
      nameChip(p.name, p.base),
      h('b', { text: res.created ? `Welcome, ${p.name}!` : `Welcome back, ${p.name}!` }),
      h('p', { text: res.created ? `${p.name} is now a player on this device, garden and all.` : `${p.name}'s garden is ready on this device.` }),
      h('div', { class: 'cs-row' }, go, undo)));
    paintWho();
    paintCode();
  }

  // ---------------------------------------------------------------- mount
  paintWho();
  if (!soon) {
    paintCode();
    paintLoad();
  }
  const m = menus.openModal(root, { cls: 'sas-cs', label: 'Cloud Save' });
  root.appendChild(menus.doneRow(() => m.close()));
  const offs = [
    bus.on('cloud:status', (e) => {
      if (soon || e?.profileId !== prof().id || disposed) return;
      if (e.state === 'moved' || e.state === 'linked' || e.state === 'off') paintCode();
      else paintStatus(e);
    }),
    bus.on('profile:active', () => {
      paintWho();
      if (!soon) paintCode();
    }),
  ];
  if (!soon) tick = setInterval(() => statusEl.isConnected && paintStatus(), 20000);
  m.dispose = () => {
    disposed = true;
    clearInterval(tick);
    offs.forEach((f) => f());
  };
  if (opts.code && !soon) {
    codeInput.value = formatCodeInput(opts.code);
    setTimeout(() => !disposed && check(), 0);
  }
  return m;
}
