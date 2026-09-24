// Tiny synchronous event bus. Gameplay emits; UI, audio, FX and views listen.
// Event names and payloads are documented in docs/ARCHITECTURE.md.
export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    let set = this.map.get(name);
    if (!set) this.map.set(name, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  once(name, fn) {
    const off = this.on(name, (p) => {
      off();
      fn(p);
    });
    return off;
  }
  emit(name, payload) {
    const set = this.map.get(name);
    if (set) for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[events] handler for "${name}" failed`, e);
      }
    }
    const any = this.map.get('*');
    if (any) for (const fn of [...any]) fn({ name, payload });
  }
  clear() {
    this.map.clear();
  }
}

export const bus = new EventBus();
