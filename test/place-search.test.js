const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pollev-watcher.user.js'), 'utf8');
const helpers = source.slice(source.indexOf('  function normalizePlaceResults('), source.indexOf('  const pageWindow ='));

function createSearchHarness() {
  let now = 10_000;
  let aborted = 0;
  const requests = [];
  const context = {
    Date: { now: () => now },
    GM_xmlhttpRequest(options) {
      requests.push(options);
      return { abort() { aborted += 1; options.onabort(); } };
    },
  };
  vm.runInNewContext(helpers, context);
  return {
    client: context.createPlaceSearchClient(),
    normalize: context.normalizePlaceResults,
    requests,
    advance() { now += 1200; },
    aborted: () => aborted,
    respond(data, status = 200) {
      requests.at(-1).onload({ status, responseText: JSON.stringify(data) });
    },
  };
}

const place = (name = 'Library', longitude = -117.8402, latitude = 33.6462) => ({
  geometry: { type: 'Point', coordinates: [longitude, latitude] },
  properties: { name, city: 'Irvine', state: 'California', country: 'United States' },
});

test('place results respect GeoJSON longitude/latitude order and filter invalid coordinates', () => {
  const harness = createSearchHarness();
  const results = harness.normalize({ features: [place(), place('Invalid', 200), place('Null', null), place('String', '1'), place('Invalid', 0, 91), {}] });
  assert.equal(results.length, 1);
  assert.equal(results[0].latitude, 33.6462);
  assert.equal(results[0].longitude, -117.8402);
  assert.equal(results[0].address, 'Irvine, California, United States');
  assert.equal(harness.normalize({ features: Array.from({ length: 7 }, () => place()) }).length, 5);
  assert.throws(() => harness.normalize({}), /无效数据/);
});

test('explicit place searches encode queries, cache duplicates and limit request frequency', async () => {
  const harness = createSearchHarness();
  const promise = harness.client.search('  Library & Irvine  ');
  const request = harness.requests[0];
  assert.equal(request.method, 'GET');
  assert.equal(request.url, 'https://photon.komoot.io/api/?q=Library%20%26%20Irvine&limit=5');
  assert.equal(request.anonymous, true);
  harness.respond({ features: [place()] });
  const results = await promise;
  assert.equal((await harness.client.search('library & irvine')), results);
  assert.equal(harness.requests.length, 1);
  await assert.rejects(harness.client.search('Other place'), /频繁/);
  harness.advance();
  const empty = harness.client.search('Other place');
  harness.respond({ features: [] });
  assert.equal((await empty).length, 0);
});

test('blank and overlong queries never send requests', async () => {
  const harness = createSearchHarness();
  await assert.rejects(harness.client.search('  '), /至少两个字符/);
  await assert.rejects(harness.client.search('x'.repeat(201)), /过长/);
  assert.equal(harness.requests.length, 0);
});

test('search handles malformed responses, HTTP failures, timeouts and blocked requests', async () => {
  for (const [complete, message] of [
    [(request) => request.onload({ status: 200, responseText: 'not json' }), /无效数据/],
    [(request) => request.onload({ status: 200, responseText: '{}' }), /无效数据/],
    [(request) => request.onload({ status: 429 }), /限流/],
    [(request) => request.onload({ status: 503 }), /暂不可用/],
    [(request) => request.ontimeout(), /超时/],
    [(request) => request.onerror(), /无法连接/],
  ]) {
    const harness = createSearchHarness();
    const promise = harness.client.search('Library');
    complete(harness.requests[0]);
    await assert.rejects(promise, message);
  }
});

test('cancel aborts in-flight searches and ignores late responses', async () => {
  const harness = createSearchHarness();
  const pending = harness.client.search('Library');
  await assert.rejects(harness.client.search('Other'), /正在搜索/);
  harness.client.cancel();
  await assert.rejects(pending, /取消/);
  assert.equal(harness.aborted(), 1);
  harness.respond({ features: [place('Late')] });
  harness.advance();
  const next = harness.client.search('Library');
  assert.equal(harness.requests.length, 2);
  harness.respond({ features: [place('Fresh')] });
  assert.equal((await next)[0].name, 'Fresh');
});

test('place search only transmits query text, not location or Telegram settings', () => {
  assert.match(source, /@connect\s+photon\.komoot\.io/);
  assert.doesNotMatch(helpers, /STORAGE_KEYS|locationSetting|location\.href|navigator/);
  assert.match(source, /name\.textContent = result\.name/);
});

test('map pin dimensions include its border and preserve Leaflet anchor margins', () => {
  const iconRule = source.match(/\.pw-map-pin \{([^}]+)\}/)[1];
  const shapeRule = source.match(/\.pw-map-pin::before \{([^}]+)\}/)[1];
  assert.doesNotMatch(iconRule, /margin/);
  assert.match(shapeRule, /box-sizing: border-box/);
  assert.match(source, /iconAnchor: \[12, 29\]/);
});
