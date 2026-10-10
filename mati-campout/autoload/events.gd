extends Node
## Global event bus.
##
## Systems announce what happened here instead of holding references to each
## other. Emitters never assume anyone is listening. Keep payloads plain data
## (ids, numbers, positions) so a future network layer can mirror them.

# --- Feedback / UI -----------------------------------------------------------
## Small toast in the corner. kind: "info", "good", "warn", "bad", "loot".
signal notify(text: String, kind: String)
## Large centred banner (e.g. "THE FIRE IS OUT. YOU ARE NO LONGER SAFE.").
signal big_message(text: String, color: Color, duration: float)
## Request a camera shake. strength ~0.1 (tap) .. 1.0 (boss slam).
signal camera_shake(strength: float)
## A world-space floating number/word (damage, +3 Wood).
signal float_text(world_pos: Vector3, text: String, color: Color)
## A modal UI opened/closed (crafting, storage, trade, map, build, pause...).
signal ui_modal_opened(modal_name: String)
signal ui_modal_closed(modal_name: String)
## Accessibility caption for an important sound ("[growling nearby]").
signal caption(text: String)
## Ask the HUD to open a specific modal. args are modal-specific.
signal request_modal(modal_name: String, args: Dictionary)

# --- Inventory / economy -----------------------------------------------------
signal inventory_changed()
signal storage_changed()
signal selected_slot_changed(index: int)
signal item_picked_up(item_id: String, count: int)
signal inventory_full(item_id: String)
signal coins_changed(total: int, delta: int)
signal item_crafted(item_id: String, count: int)
signal sack_upgraded(sack_id: String, capacity: int)

# --- Campfire ----------------------------------------------------------------
signal fire_fuel_changed(fuel: float, max_fuel: float)
## state: FireModel.State (STRONG, LOW, OUT)
signal fire_state_changed(state: int)
signal fire_fed(item_id: String)
signal fire_relit()
signal fire_extinguished()
signal fire_level_changed(level: int)
signal food_cooked(item_id: String)

# --- Time / world --------------------------------------------------------------
## phase: DayCycle.Phase
signal phase_changed(phase: int)
signal dusk_warning()
signal night_started(night_number: int)
signal night_survived(nights_total: int)
signal weather_changed(kind: String)
signal landmark_discovered(landmark_id: String)

# --- Player ------------------------------------------------------------------
signal player_damaged(amount: float, source_kind: String)
signal player_healed(amount: float)
signal player_ate(item_id: String)
signal player_died(cause: String)
signal player_stats_changed()
signal tool_swung(item_id: String)

# --- Gathering / combat ----------------------------------------------------------
signal tree_hit(world_pos: Vector3, tree_kind: String)
signal tree_chopped(world_pos: Vector3, tree_kind: String)
signal resource_gathered(item_id: String, count: int)
signal enemy_damaged(enemy_kind: String, amount: float)
signal enemy_killed(enemy_kind: String, world_pos: Vector3)
signal chest_opened(tier: String, world_pos: Vector3)

# --- Camp progression ----------------------------------------------------------
signal tent_upgraded(level: int)
signal camp_expanded(level: int)
signal structure_built(structure_id: String, world_pos: Vector3)
signal map_unlocked()

# --- Creatures / NPCs ------------------------------------------------------------
signal pet_tamed(pet_name: String)
signal pet_command(command: String)
signal trade_completed(trader_id: String)
signal boss_warning()
signal boss_spawned()
signal boss_defeated()
signal boss_retreated()

# --- Run lifecycle -----------------------------------------------------------------
signal run_started(seed: int)
signal run_ended(summary: Dictionary)
signal game_paused(paused: bool)

# --- Platform -----------------------------------------------------------------------
## Touch controls switched on (a touch) or off (keyboard / mouse / gamepad input).
signal input_mode_changed(touch: bool)
## The app was hidden / shown (tab switch, phone app switch) or rotated to
## portrait. paused = true while the device guard holds the game paused.
signal device_paused(paused: bool, reason: String)
