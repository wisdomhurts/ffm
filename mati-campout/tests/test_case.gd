extends RefCounted
## Minimal unit-test base. Test files extend this and define test_* methods.

var failures: Array = []
var current_test := ""


func fail(msg: String) -> void:
	failures.append("%s: %s" % [current_test, msg])


func assert_true(cond: bool, msg: String = "expected true") -> void:
	if not cond:
		fail(msg)


func assert_false(cond: bool, msg: String = "expected false") -> void:
	if cond:
		fail(msg)


func assert_eq(actual: Variant, expected: Variant, msg: String = "") -> void:
	if typeof(actual) in [TYPE_FLOAT, TYPE_INT] and typeof(expected) in [TYPE_FLOAT, TYPE_INT]:
		if absf(float(actual) - float(expected)) > 0.0001:
			fail("%s expected %s, got %s" % [msg, str(expected), str(actual)])
	elif actual != expected:
		fail("%s expected %s, got %s" % [msg, str(expected), str(actual)])


func assert_near(actual: float, expected: float, tol: float, msg: String = "") -> void:
	if absf(actual - expected) > tol:
		fail("%s expected %s +/- %s, got %s" % [msg, str(expected), str(tol), str(actual)])


func assert_gt(a: float, b: float, msg: String = "") -> void:
	if not a > b:
		fail("%s expected %s > %s" % [msg, str(a), str(b)])


func assert_lt(a: float, b: float, msg: String = "") -> void:
	if not a < b:
		fail("%s expected %s < %s" % [msg, str(a), str(b)])
