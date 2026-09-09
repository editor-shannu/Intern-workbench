"""Consumes the chat SSE stream and asserts deltas + file-block parsing work."""
import json
import sys

import httpx

BASE, TOKEN, WS_ID = sys.argv[1], sys.argv[2], sys.argv[3]

with httpx.stream(
    "POST",
    f"{BASE}/api/workspaces/{WS_ID}/chat",
    headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    json={"message": "please add a helper function", "model": "test/mock-model"},
    timeout=30,
) as r:
    r.raise_for_status()
    full = ""
    done_payload = None
    for line in r.iter_lines():
        if not line or not line.startswith("data: "):
            continue
        obj = json.loads(line[len("data: "):])
        if "delta" in obj:
            full += obj["delta"]
        elif "done" in obj:
            done_payload = obj
        elif "error" in obj:
            print("STREAM ERROR:", obj["error"])
            sys.exit(1)

print("Reconstructed streamed text:")
print(full)
assert "def add(a, b):" in full, "canned reply text missing from stream"
assert done_payload is not None, "no 'done' event received"
edits = done_payload.get("proposed_edits") or []
assert edits, "no proposed_edits parsed from the stream"
assert edits[0]["path"] == "app/new_feature.py", f"unexpected path: {edits[0]['path']}"
assert "return a + b" in edits[0]["content"], "edit content missing expected code"
print("SSE streaming + <<<FILE>>> block parsing: OK")
