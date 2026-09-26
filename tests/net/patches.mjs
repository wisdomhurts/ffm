// The small changes online play needs in files the net agent doesn't own (see the net report,
// "sharedChangesRequested"). tests/net/build-patched.mjs applies them in memory so the browser test
// runs the real integration before the integrator lands them; once landed, the patcher skips them.
export const PATCHES = [
  {
    file: 'src/main.js',
    why: 'Online rooms build their world through the app (HUD, camera, touch, state machine), like solo play.',
    find: `  hasSave(profileId) {`,
    replace: `  /**
   * Online rooms (src/net/session.js) build their world through here, so the HUD, camera, touch
   * controls and app state work exactly like solo play. opts: Game options incl. \`slots\`.
   */
  startOnline(opts) {
    const game = this._newGame({ mode: 'endless', difficulty: settings.difficulty, ...opts });
    game.saveKey = null; // online gardens are saved into profile.online by the session
    this.hud = createHUD(this);
    this.menus.hideAll();
    if (this.human) {
      this.cam.snapBehind(this.human.yaw);
      this.cam.yaw = this.human.yaw;
      this.cam.playIntro(reducedMotion() ? 0.01 : 1.6);
    }
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.touch.setVisible(true);
    this.audio.unlock();
    this.audio.setMusicMode('play');
    bus.emit('game:start', { game, human: this.human, resumed: false, online: true });
    bus.emit('app:state', { state: 'playing' });
    return game;
  }

  hasSave(profileId) {`,
    done: 'startOnline(opts)',
  },
  {
    file: 'src/main.js',
    why: 'The pause menu is only an overlay online: the host keeps simulating for everyone.',
    find: `    this.state = 'paused';
    this.game.paused = true;`,
    replace: `    this.state = 'paused';
    if (!this.online?.room) this.game.paused = true; // online the world keeps running under the menu`,
    done: 'if (!this.online?.room) this.game.paused = true',
  },
  {
    file: 'src/main.js',
    why: 'Quitting leaves the room (saves the online garden, hands the room to the next host).',
    find: `  quitToTitle() {
    this.saveNow();`,
    replace: `  quitToTitle() {
    this.online?.leave?.();
    this.saveNow();`,
    done: `quitToTitle() {
    this.online?.leave?.();`,
  },
  {
    file: 'src/ui/hud.js',
    why: 'Mute (room chip) hides that player\'s quick-chat lines on this device, also when this device hosts.',
    find: `  const off = bus.on('chat', ({ player, text, quick }) => {
    if (!player) return;`,
    replace: `  const off = bus.on('chat', ({ player, text, quick }) => {
    if (!player || app.online?.isMuted?.(player)) return;`,
    done: 'app.online?.isMuted?.(player)',
  },
];
