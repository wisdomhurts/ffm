extends Node
## The current survival run: models, wallet, statistics and references to the
## live scene objects. Everything gameplay-relevant that must be saved, shown
## in the HUD or shared between systems lives here.
##
## Scene nodes register themselves (player, campfire, game) when they enter
## the tree, so other systems can find them without fragile node paths.
## Multiplayer note: per-player state (inventory, survival, selected slot) is
## grouped under `local` helpers so a future version can hold one per player.

enum RunState { NONE, LOADING, PLAYING, DEAD }

var state: int = RunState.NONE
var seed: int = 0
var day_cycle := DayCycle.new()
var survival := SurvivalModel.new()
var fire := FireModel.new()
var inventory := Inventory.new(7)
var storage := Inventory.new(16)
## Extra storage chests built at camp share the crafting pool.
var extra_storage: Array = []
var sack_id: String = "old_sack"
var selected_slot: int = 0
var coins: int = 0
var tent_level: int = 1
var camp_level: int = 1
var time_scale: float = 1.0
## True while a modal UI (crafting, storage, map, pause...) has focus; the
## player ignores gameplay input while it is set.
var ui_blocking: bool = false
var rng := RandomNumberGenerator.new()

## Run statistics shown on the game-over screen and leaderboard.
var stats: Dictionary = {}
## Misc run flags: has_map, lighthouse_found, boss_seen, pet_name, ...
var flags: Dictionary = {}
var death_cause: String = ""

# Live scene references (set by the nodes themselves; may be null).
var game: Node = null
var world_gen: WorldGen = null
var player: Node3D = null
var campfire: Node3D = null
var camp: Node3D = null
var vegetation: Node = null
var environment: Node = null


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	inventory.stack_lookup = DB.stack_size
	storage.stack_lookup = DB.stack_size
	day_cycle.phase_changed.connect(func(p: int) -> void: Events.phase_changed.emit(p))
	day_cycle.night_survived.connect(_on_night_survived)
	day_cycle.dusk_warning.connect(func() -> void: Events.dusk_warning.emit())
	fire.state_changed.connect(func(s: int) -> void: Events.fire_state_changed.emit(s))
	fire.fuel_changed.connect(func(f: float, m: float) -> void: Events.fire_fuel_changed.emit(f, m))
	fire.extinguished.connect(func() -> void: Events.fire_extinguished.emit())
	fire.relit.connect(func() -> void: Events.fire_relit.emit())
	fire.level_changed.connect(func(l: int) -> void: Events.fire_level_changed.emit(l))
	inventory.changed.connect(func() -> void: Events.inventory_changed.emit())
	storage.changed.connect(func() -> void: Events.storage_changed.emit())
	survival.died.connect(_on_player_died)
	survival.changed.connect(func() -> void: Events.player_stats_changed.emit())


## Reset everything for a brand-new run.
func new_run(p_seed: int = -1) -> void:
	if p_seed < 0:
		rng.randomize()
		p_seed = rng.randi() % 1000000000
	seed = p_seed
	rng.seed = p_seed
	state = RunState.LOADING
	var cycle_cfg: Dictionary = (DB.b("day_cycle", {}) as Dictionary).duplicate()
	var mult := float(Settings.get_value("day_length_mult"))
	for k in ["day_seconds", "dusk_seconds", "night_seconds", "dawn_seconds"]:
		cycle_cfg[k] = float(cycle_cfg.get(k, 60.0)) * mult
	day_cycle.setup(cycle_cfg)
	survival.setup(DB.b("survival", {}))
	var fuels := {}
	for id in DB.items:
		var fv := DB.fuel_value(id)
		if fv > 0.0:
			fuels[id] = fv
	fire.setup(DB.b("fire", {}), DB.upgrades.get("fire", {}).get("levels", []), fuels)
	sack_id = str(DB.b("start_sack", "old_sack"))
	inventory.set_capacity(0)
	inventory.slots.clear()
	inventory.set_capacity(sack_capacity(sack_id))
	for e in DB.b("start_inventory", []):
		inventory.add(str(e["id"]), int(e["count"]))
	storage.slots.clear()
	storage.set_capacity(int(DB.b("camp.storage_slots", 16)))
	var start_storage: Dictionary = DB.b("camp.start_storage", {})
	for id in start_storage:
		storage.add(id, int(start_storage[id]))
	extra_storage.clear()
	selected_slot = 0
	coins = int(DB.b("start_coins", 0))
	tent_level = 1
	camp_level = 1
	time_scale = 1.0
	ui_blocking = false
	death_cause = ""
	stats = {
		"nights": 0, "trees_chopped": 0, "enemies_defeated": 0, "distance": 0.0,
		"chests_opened": 0, "highest_tent": 1, "boss_encounters": 0, "bosses_defeated": 0,
		"food_eaten": 0, "fuel_added": 0, "wolves_tamed": 0, "items_crafted": 0,
		"coins_earned": 0, "fire_outs": 0,
	}
	flags = {}
	Events.inventory_changed.emit()
	Events.storage_changed.emit()
	Events.coins_changed.emit(coins, 0)


func begin_play() -> void:
	state = RunState.PLAYING
	Events.run_started.emit(seed)


func is_playing() -> bool:
	return state == RunState.PLAYING


# --- Wallet --------------------------------------------------------------------

func add_coins(n: int) -> void:
	if n == 0:
		return
	coins = maxi(coins + n, 0)
	if n > 0:
		stat_add("coins_earned", n)
	Events.coins_changed.emit(coins, n)


func spend_coins(n: int) -> bool:
	if n > coins:
		return false
	coins -= n
	Events.coins_changed.emit(coins, -n)
	return true


# --- Inventory helpers -----------------------------------------------------------

func sack_capacity(id: String) -> int:
	return int(DB.item(id).get("capacity", 7))


## Equip a better sack. Ignored if it is not bigger than the current one.
func upgrade_sack(id: String) -> bool:
	var cap := sack_capacity(id)
	if cap <= inventory.capacity:
		return false
	sack_id = id
	inventory.set_capacity(cap)
	Events.sack_upgraded.emit(id, cap)
	return true


## Give the player an item, handling coins and sacks specially. Returns the
## number that did not fit (dropping them is the caller's job).
func give(id: String, count: int = 1, meta: Dictionary = {}) -> int:
	if id == "coins":
		add_coins(count)
		return 0
	if DB.item_kind(id) == "sack":
		if not upgrade_sack(id):
			add_coins(int(DB.item(id).get("sell", 0)) + 10)
			Events.notify.emit("Already have a bigger sack: sold for coins", "info")
		return 0
	if DB.item_kind(id) == "special" and id == "map":
		unlock_map()
		return 0
	var left := inventory.add(id, count, meta)
	if left < count:
		Events.item_picked_up.emit(id, count - left)
	if left > 0:
		Events.inventory_full.emit(id)
	return left


func unlock_map() -> void:
	if flags.get("has_map", false):
		return
	flags["has_map"] = true
	Events.map_unlocked.emit()


## Inventories used for crafting/building, in payment order (camp first).
func crafting_sources() -> Array:
	var s: Array = [storage]
	s.append_array(extra_storage)
	s.append(inventory)
	return s


func can_afford(costs: Dictionary) -> bool:
	return Crafting.can_afford(costs, crafting_sources(), coins)


## Pay a cost (items from camp storage first, then the sack; plus coins).
func pay(costs: Dictionary) -> bool:
	if not can_afford(costs):
		return false
	var c := int(costs.get("coins", 0))
	if not Crafting.consume_items(costs, crafting_sources()):
		return false
	if c > 0:
		spend_coins(c)
	return true


func selected_item_id() -> String:
	return inventory.slot_id(selected_slot)


func select_slot(i: int) -> void:
	if inventory.capacity <= 0:
		return
	i = posmod(i, inventory.capacity)
	if i == selected_slot:
		return
	selected_slot = i
	Events.selected_slot_changed.emit(i)


# --- Stats ---------------------------------------------------------------------

func stat_add(key: String, amount: Variant = 1) -> void:
	stats[key] = stats.get(key, 0) + amount


func stat_max(key: String, value: Variant) -> void:
	stats[key] = max(stats.get(key, 0), value)


func night_number() -> int:
	return day_cycle.night_number()


func difficulty_cfg() -> Dictionary:
	return DB.b("difficulty", {})


# --- Lifecycle -------------------------------------------------------------------

func _on_night_survived(total: int) -> void:
	stats["nights"] = total
	Events.night_survived.emit(total)
	if total >= 3:
		Profile.unlock("nights_3")
	if total >= 5:
		Profile.unlock("nights_5")


func _on_player_died(cause: String) -> void:
	if state != RunState.PLAYING:
		return
	death_cause = cause
	state = RunState.DEAD
	Events.player_died.emit(cause)


## Build the run summary and record it. Called once by the game-over flow.
func end_run() -> Dictionary:
	var summary := {
		"nights": day_cycle.nights_survived,
		"day": day_cycle.day,
		"seed": seed,
		"cause": death_cause,
		"stats": stats.duplicate(true),
	}
	summary["stats"]["nights"] = day_cycle.nights_survived
	summary["rank"] = Profile.submit_run(summary)
	summary["best"] = Profile.best_nights()
	Events.run_ended.emit(summary)
	return summary


func clear_scene_refs() -> void:
	game = null
	world_gen = null
	player = null
	campfire = null
	camp = null
	vegetation = null
	environment = null
	Lights.clear()
