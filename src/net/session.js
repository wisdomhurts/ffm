// Multiplayer sessions. OWNER: net agent (docs/ONLINE.md). createOnline(app).
export function createOnline() {
  return { available: false, isHost: false, isClient: false, room: null, members: [], act() {}, update() {}, leave() {}, listRooms() { return () => {}; } };
}
