#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCENARIOS_DIR="${SCENARIOS_DIR:-$ROOT_DIR/scenarios}"
OUT_FILE="${1:-$ROOT_DIR/scenarios-ai-bundle.md}"

if [ ! -d "$SCENARIOS_DIR" ]; then
  echo "ERROR: scenarios directory not found: $SCENARIOS_DIR" >&2
  exit 1
fi

SCENARIO_COUNT=0
for scenario_dir in "$SCENARIOS_DIR"/*; do
  [ -d "$scenario_dir" ] || continue
  SCENARIO_COUNT=$((SCENARIO_COUNT + 1))
done

{
  echo "# GitArena Scenario Bundle For AI Validation"
  echo
  echo "- Generated (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Repository Root: $ROOT_DIR"
  echo "- Scenarios Directory: $SCENARIOS_DIR"
  echo "- Scenario Count: $SCENARIO_COUNT"
  echo
  echo "This bundle includes each scenario's metadata, seed script, and evaluator script."
  echo

  for scenario_dir in "$SCENARIOS_DIR"/*; do
    [ -d "$scenario_dir" ] || continue

    scenario_id="$(basename "$scenario_dir")"
    metadata_path="$scenario_dir/metadata.json"
    seed_path="$scenario_dir/seed.sh"
    eval_path="$scenario_dir/eval.sh"

    echo "---"
    echo
    echo "## Scenario: $scenario_id"
    echo
    echo "- Directory: \`scenarios/$scenario_id\`"
    echo "- Metadata: \`$( [ -f "$metadata_path" ] && echo yes || echo no )\`"
    echo "- Seed Script: \`$( [ -f "$seed_path" ] && echo yes || echo no )\`"
    echo "- Eval Script: \`$( [ -f "$eval_path" ] && echo yes || echo no )\`"
    echo

    echo "### metadata.json"
    if [ -f "$metadata_path" ]; then
      echo '```json'
      cat "$metadata_path"
      echo '```'
    else
      echo "_Missing_"
    fi
    echo

    echo "### seed.sh"
    if [ -f "$seed_path" ]; then
      echo '```bash'
      cat "$seed_path"
      echo '```'
    else
      echo "_Missing_"
    fi
    echo

    echo "### eval.sh"
    if [ -f "$eval_path" ]; then
      echo '```bash'
      cat "$eval_path"
      echo '```'
    else
      echo "_Missing_"
    fi
    echo
  done
} > "$OUT_FILE"

echo "Wrote scenario bundle to: $OUT_FILE"
wc -l "$OUT_FILE" | awk '{print "Line count: " $1}'
wc -c "$OUT_FILE" | awk '{print "Byte size: " $1}'
