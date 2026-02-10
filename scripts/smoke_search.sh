#!/usr/bin/env bash
set -euo pipefail

# Smoke test for /search endpoint semantics + basic response contract.
# - Starts the server
# - Runs curl assertions for AND (default) and OR (mode=or)
# - Verifies response shape includes docIds and snippet behavior doesn't crash

PORT="${PORT:-3131}"
BASE_URL="http://127.0.0.1:${PORT}"
export BASE_URL

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Start server
PORT="$PORT" node src/index.js > /tmp/mini-search-smoke-server.log 2>&1 &
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

node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

const base = process.env.BASE_URL;

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}: ${JSON.stringify(json)}`);
  }
  return json;
}

function asSet(arr) {
  assert.ok(Array.isArray(arr), 'docIds should be an array');
  return new Set(arr.map(String));
}

// Known seed corpus in src/index.js:
// 1: quick brown fox ... lazy dog
// 2: quick red fox ... sleeping cat
// 3: cats and dogs can be friends

// AND default: "quick fox" should return docs 1 and 2 only.
{
  const j = await getJson(`${base}/search?q=${encodeURIComponent('quick fox')}`);
  assert.equal(j.mode, 'and');
  assert.deepEqual(j.terms, ['quick', 'fox']);
  const ids = asSet(j.docIds);
  assert.deepEqual(ids, new Set(['1','2']));
  assert.equal(j.count, 2);
}

// AND default: "quick cat" should return only doc 2.
{
  const j = await getJson(`${base}/search?q=${encodeURIComponent('quick cat')}`);
  const ids = asSet(j.docIds);
  assert.deepEqual(ids, new Set(['2']));
  assert.equal(j.count, 1);
}

// OR mode: "cat dog" should return union (docs 1,2,3).
{
  const j = await getJson(`${base}/search?q=${encodeURIComponent('cat dog')}&mode=or`);
  assert.equal(j.mode, 'or');
  const ids = asSet(j.docIds);
  assert.deepEqual(ids, new Set(['1','2','3']));
  assert.equal(j.count, 3);
}

// Response contract: include=snippet should include results[] with docId + snippet (snippet may be null)
{
  const j = await getJson(`${base}/search?q=${encodeURIComponent('quick')}&include=snippet`);
  assert.ok(Array.isArray(j.results), 'results should be an array when include=snippet');
  assert.ok(j.results.length >= 1);
  for (const r of j.results) {
    assert.ok(r && (typeof r === 'object'));
    assert.ok('docId' in r);
    assert.ok('snippet' in r);
    // snippet can be string or null; should not crash
    assert.ok(typeof r.snippet === 'string' || r.snippet === null);
  }
}

console.log('smoke:search passed');
NODE