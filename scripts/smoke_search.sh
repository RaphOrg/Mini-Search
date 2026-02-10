#!/usr/bin/env bash
set -euo pipefail

# Smoke test for /search endpoint semantics + basic response contract.
# - Creates an isolated Postgres DB (derived from DATABASE_URL)
# - Runs migrations and seeds a known fixture corpus
# - Starts the server pointed at that DB
# - Runs assertions with exact expected ids/counts

PORT="${PORT:-3131}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
export BASE_URL

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi

  if [[ -n "${DROP_DB_CMD:-}" ]]; then
    # shellcheck disable=SC2086
    eval "$DROP_DB_CMD" || true
  fi
}
trap cleanup EXIT

command -v psql >/dev/null 2>&1 || fail "Missing prerequisite: psql. Install postgresql-client and ensure psql is on PATH."
[[ -n "${DATABASE_URL:-}" ]] || fail "Missing required environment variable: DATABASE_URL (must point to a locally available Postgres)."

# Create isolated DB + run migrations + seed fixtures; prints DATABASE_URL=<isolated> and DROP_DB_CMD=<...>
# We eval it to export those vars into this shell.
eval "$(node scripts/smoke_search_setup.js)"

# Start server
PORT="$PORT" DATABASE_URL="$DATABASE_URL" node src/index.js > /tmp/mini-search-smoke-server.log 2>&1 &
SERVER_PID=$!

# Wait for health
for _ in {1..50}; do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if ! curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
  echo "Server failed to start; logs:" >&2
  sed -n '1,200p' /tmp/mini-search-smoke-server.log >&2 || true
  exit 1
fi

BASE_URL="$BASE_URL" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

const base = process.env.BASE_URL;

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}: ${JSON.stringify(json)}`);
  }
  return json;
}

function idsAsStrings(arr) {
  assert.ok(Array.isArray(arr), 'docIds should be an array');
  return arr.map(String);
}

// Fixtures seeded by scripts/smoke_search_setup.js:
// 1: quick brown fox ... lazy dog
// 2: quick red fox ... sleeping cat
// 3: cats and dogs can be friends

// AND default: "quick fox" should return docs 1 and 2 only.
{
  const j = await getJson(`${base}/search?q=${encodeURIComponent('quick fox')}`);
  assert.equal(j.mode, 'and');
  assert.deepEqual(j.terms, ['quick', 'fox']);
  assert.deepEqual(idsAsStrings(j.docIds), ['1', '2']);
  assert.equal(j.count, 2);
}

// AND default: "quick cat" should return only doc 2.
{
  const j = await getJson(`${base}/search?q=${encodeURIComponent('quick cat')}`);
  assert.deepEqual(idsAsStrings(j.docIds), ['2']);
  assert.equal(j.count, 1);
}

// OR mode: "cat dog" should return union (docs 1,2,3) in docId order.
{
  const j = await getJson(`${base}/search?q=${encodeURIComponent('cat dog')}&mode=or`);
  assert.equal(j.mode, 'or');
  assert.deepEqual(idsAsStrings(j.docIds), ['1', '2', '3']);
  assert.equal(j.count, 3);
}

// Response contract: include=snippet should include results[] with docId + snippet (snippet may be null)
{
  const j = await getJson(`${base}/search?q=${encodeURIComponent('quick')}&include=snippet`);
  assert.ok(Array.isArray(j.results), 'results should be an array when include=snippet');
  assert.ok(j.results.length === 2, `expected exactly 2 results for term 'quick', got ${j.results.length}`);
  assert.deepEqual(j.results.map((r) => String(r.docId)), ['1', '2']);
  for (const r of j.results) {
    assert.ok(r && typeof r === 'object');
    assert.ok('docId' in r);
    assert.ok('snippet' in r);
    // snippet can be string or null; should not crash
    assert.ok(typeof r.snippet === 'string' || r.snippet === null);
  }
}

console.log('smoke:search passed');
NODE
