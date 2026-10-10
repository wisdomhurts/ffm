extends Node
## Read-only game data registry (items, recipes, loot, enemies, upgrades,
## traders, buildables, cosmetics, balance). Loaded once from res://data/*.json.
##
## Gameplay code reads tuning values through DB.b("fire.levels") style paths
## so balancing never requires touching scripts.

var items: Dictionary = {}
var recipes: Dictionary = {}
var loot_tables: Dictionary = {}
var enemies: Dictionary = {}
var upgrades: Dictionary = {}
var traders: Dictionary = {}
var buildables: Dictionary = {}
var cosmetics: Dictionary = {}
var balance: Dictionary = {}


func _init() -> void:
	reload()


func reload() -> void:
	var all := DataLoader.load_all()
	items = all.get("items", {})
	recipes = all.get("recipes", {})
	loot_tables = all.get("loot_tables", {})
	enemies = all.get("enemies", {})
	upgrades = all.get("upgrades", {})
	traders = all.get("traders", {})
	buildables = all.get("buildables", {})
	cosmetics = all.get("cosmetics", {})
	balance = all.get("balance", {})


# --- Items ---------------------------------------------------------------------

func has_item(id: String) -> bool:
	return items.has(id)


## Item definition, or an empty Dictionary for unknown ids.
func item(id: String) -> Dictionary:
	return items.get(id, {})


func item_name(id: String) -> String:
	if id == "coins":
		return "Coins"
	return str(items.get(id, {}).get("name", id.capitalize()))


func item_kind(id: String) -> String:
	return str(items.get(id, {}).get("kind", ""))


func stack_size(id: String) -> int:
	return int(items.get(id, {}).get("stack", 1))


## Seconds of burn time the item gives a campfire (0 = not fuel).
func fuel_value(id: String) -> float:
	return float(items.get(id, {}).get("fuel", 0.0))


func icon_path(id: String) -> String:
	return "res://assets/icons/%s.png" % id


func icon(id: String) -> Texture2D:
	var p := icon_path(id)
	if ResourceLoader.exists(p):
		return load(p)
	return null


# --- Balance -------------------------------------------------------------------

## Look up a balance value by dotted path, e.g. b("fire.levels").
func b(path: String, default: Variant = null) -> Variant:
	var cur: Variant = balance
	for part in path.split("."):
		if cur is Dictionary and (cur as Dictionary).has(part):
			cur = (cur as Dictionary)[part]
		elif cur is Array and part.is_valid_int() and int(part) < (cur as Array).size():
			cur = (cur as Array)[int(part)]
		else:
			return default
	return cur


func bf(path: String, default: float = 0.0) -> float:
	return float(b(path, default))


func bi(path: String, default: int = 0) -> int:
	return int(b(path, default))


# --- Other tables ----------------------------------------------------------------

func recipe(id: String) -> Dictionary:
	return recipes.get(id, {})


func loot_table(id: String) -> Dictionary:
	return loot_tables.get(id, {})


func enemy(id: String) -> Dictionary:
	return enemies.get(id, {})


func trader(id: String) -> Dictionary:
	return traders.get(id, {})


func buildable(id: String) -> Dictionary:
	return buildables.get(id, {})
