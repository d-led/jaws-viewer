#!/usr/bin/env bash
# Static analysis for the viewer: shell scripts, formatting, types, two linters, complexity,
# CRAP and duplication. Stops at the first check that finds something, and exits non-zero so it
# can gate a commit or a pipeline.
#
# Usage:
#   scripts/lint.sh                    # run every check
#   scripts/lint.sh --install          # install what is missing, then run
#
# Checks (in order): shellcheck, prettier, tsc, oxlint, eslint, complexity + CRAP, jscpd.
#
# Every check is judged by its EXIT CODE. Never by its output: a clean run may still print a
# summary (oxlint prints "Found 0 warnings and 0 errors." when a terminal is watching), and
# reading that as a finding fails a passing tree. Warnings are made fatal on purpose, with
# --deny-warnings and --max-warnings 0, so the exit code carries them.
#
# Cyclomatic complexity is judged together with coverage rather than on its own, because
# complexity only matters where the tests do not reach — that is the CRAP score.
set -euo pipefail

# --- tunable thresholds -----------------------------------------------------
COMPLEXITY_MAX="${COMPLEXITY_MAX:-12}"     # cyclomatic complexity of one function that fails
CRAP_MAX="${CRAP_MAX:-30}"                 # CRAP score of one function that fails
TOP="${TOP:-15}"                           # how many of the worst functions to print
JSCPD_THRESHOLD="${JSCPD_THRESHOLD:-0.5}"  # duplication % that fails

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--install" ]]; then
  echo "installing missing tools…"
  command -v shellcheck >/dev/null || echo "  shellcheck is missing: brew install shellcheck"
  npm install
  echo "done."
fi

RED=$'\033[31m'; GREEN=$'\033[32m'; BOLD=$'\033[1m'; RESET=$'\033[0m'

section() { printf '\n%s\n' "${BOLD}==> $*${RESET}"; }
fail()    { printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }
need()    { command -v "$1" >/dev/null 2>&1 || fail "$1 is not installed — run scripts/lint.sh --install"; }
# Runs one check silently and stops the run if it exits non-zero, replaying what it said.
check()   { local label="$1" output; shift
            if ! output="$("$@" 2>&1)"; then
              printf '%s\n' "$output" >&2
              fail "$label: the findings above need fixing"
            fi; }

section "shellcheck (the scripts in this repository)"
need shellcheck
check "shellcheck" shellcheck scripts/*.sh

section "prettier (formatting)"
check "prettier" npx prettier --check .

section "tsc (types)"
check "tsc" npx tsc --noEmit

section "oxlint (correctness, suspicious, perf)"
check "oxlint" npx oxlint --deny-warnings

section "eslint (type-aware)"
check "eslint" npx eslint . --max-warnings 0

section "complexity and CRAP (one function: complexity ≤ ${COMPLEXITY_MAX}, CRAP ≤ ${CRAP_MAX})"
echo "    a function is allowed to be complex only where the tests reach it"
npx vitest run --coverage --coverage.reporter=json --coverage.reportsDirectory=coverage >/dev/null ||
  fail "coverage: the unit tests did not pass, so no scores could be computed"
COMPLEXITY_MAX="$COMPLEXITY_MAX" CRAP_MAX="$CRAP_MAX" TOP="$TOP" node scripts/crap.mjs ||
  fail "CRAP: the functions above are too complex for the tests that reach them"

section "jscpd (duplication ≤ ${JSCPD_THRESHOLD}%)"
check "jscpd" npx jscpd . --config .jscpd.json --threshold "$JSCPD_THRESHOLD"

printf '\n%sall checks passed%s\n' "$GREEN" "$RESET"
