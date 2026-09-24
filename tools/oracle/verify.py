"""CI check (read-only): the committed golden.json must equal a fresh oracle run."""
import json, sys, tempfile, os
import build_golden
tmp = os.path.join(tempfile.mkdtemp(), "golden.json")
build_golden.main(tmp)
fresh = json.load(open(tmp, encoding="utf-8"))
committed = json.load(open("fixtures/golden.json", encoding="utf-8"))
if fresh != committed:
    sys.exit("fixtures/golden.json is stale or was edited by hand. Run `pnpm oracle:update` and review the diff.")
print("golden.json matches the oracle")
