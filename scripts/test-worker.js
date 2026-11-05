#!/usr/bin/env node
/* Unit checks for worker.js cover-kick (and basic routing).
 *   node scripts/test-worker.js
 * Stubs global fetch so nothing leaves the box. Never prints tokens.
 */
'use strict';

const assert = require('assert');

(async () => {
  const { default: worker } = await import('../worker.js');

  const TOKEN = 'ghs_test_token_do_not_leak_xyz';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    calls.push({ url: u, method: (opts && opts.method) || 'GET', body: opts && opts.body, headers: opts && opts.headers });
    if (u.indexOf('api.github.com') >= 0) {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ error: 'unexpected fetch: ' + u }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  };

  function req(target, extraHeaders) {
    const headers = Object.assign({
      Origin: 'https://dan-sells.co.uk',
      'CF-Connecting-IP': '203.0.113.10',
    }, extraHeaders || {});
    return new Request('https://vehicleproxy.danielcane1992.workers.dev/?target=' + encodeURIComponent(target), {
      method: 'GET',
      headers,
    });
  }

  async function read(res) {
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, text, json };
  }

  const env = { GITHUB_TOKEN: TOKEN };

  // Bad target → error body (worker returns 200 with {error}, matching other unknown targets)
  {
    const r = await read(await worker.fetch(req('not-a-real-target'), env));
    assert.ok(r.json && r.json.error, 'bad target should return an error: ' + r.text);
    assert.ok(/unknown target/i.test(r.json.error), r.json.error);
    assert.ok(r.text.indexOf(TOKEN) < 0, 'token must not appear in bad-target response');
    console.log('ok: bad target returns an error');
  }

  // First cover-kick dispatches with the right body/headers
  {
    calls.length = 0;
    const r = await read(await worker.fetch(req('cover-kick'), env));
    assert.strictEqual(r.status, 200, r.text);
    assert.deepStrictEqual(r.json, { ok: true }, r.text);
    assert.strictEqual(calls.length, 1, 'one GitHub call: ' + JSON.stringify(calls));
    assert.ok(calls[0].url.indexOf('/actions/workflows/lockup-emails.yml/dispatches') >= 0, calls[0].url);
    assert.strictEqual(calls[0].method, 'POST');
    const body = JSON.parse(calls[0].body);
    assert.deepStrictEqual(body, { ref: 'main', inputs: { dry_run: false, rota_now: false } });
    const h = calls[0].headers || {};
    const auth = h.Authorization || h.authorization;
    assert.strictEqual(auth, 'Bearer ' + TOKEN);
    assert.ok((h.Accept || h.accept || '').indexOf('application/vnd.github+json') >= 0);
    assert.strictEqual(h['X-GitHub-Api-Version'] || h['x-github-api-version'], '2022-11-28');
    assert.strictEqual(h['User-Agent'] || h['user-agent'], 'vehicleproxy');
    assert.ok(r.text.indexOf(TOKEN) < 0, 'token must not appear in ok response');
    console.log('ok: cover-kick dispatches lockup-emails with dry_run=false');
  }

  // Second call within a minute is rate-limited and does not hit GitHub again
  {
    calls.length = 0;
    const r = await read(await worker.fetch(req('cover-kick'), env));
    assert.strictEqual(r.status, 429, r.text);
    assert.ok(r.json && /too many requests/i.test(r.json.error || ''), r.text);
    assert.strictEqual(calls.length, 0, 'rate-limited kick must not call GitHub');
    assert.ok(r.text.indexOf(TOKEN) < 0, 'token must not appear in rate-limit response');
    console.log('ok: a second cover-kick within a minute is rate-limited');
  }

  // Forbidden origin
  {
    const r = await read(await worker.fetch(req('cover-kick', { Origin: 'https://evil.example' }), env));
    assert.strictEqual(r.status, 403, r.text);
    console.log('ok: a non-allowed origin is refused');
  }

  globalThis.fetch = realFetch;
  console.log('all worker tests passed');
})().catch((e) => {
  console.error('FAIL', e && e.stack || e);
  process.exit(1);
});
