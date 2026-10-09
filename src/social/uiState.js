// Which social overlays are up right now (the wheel and the gift/trade sheets never open together).
// tradePets: uids of this device's pets on offer in an open trade (ui/trade.js): My Pets can't release them
// and a full bag never sends them home to make room for a new one (ui/pets.js).
export const socialUi = { wheel: false, sheet: false, tradePets: new Set() };
