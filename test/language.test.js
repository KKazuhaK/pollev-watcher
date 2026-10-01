const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pollev-watcher.user.js'), 'utf8');
const localization = source.slice(source.indexOf('  const LANGUAGE_KEY ='), source.indexOf('  const STATES ='));

function languageHarness(preference = 'auto', languages = ['en-US']) {
  const context = {
    GM_getValue: () => preference,
    window: { navigator: { languages } },
  };
  vm.runInNewContext(`${localization}\nthis.messages = EN_MESSAGES;`, context);
  return context;
}

test('auto language follows the first browser preference, with explicit overrides', () => {
  assert.equal(languageHarness('auto', ['zh-TW', 'en']).currentLanguage(), 'zh');
  assert.equal(languageHarness('auto', ['en-US', 'zh']).currentLanguage(), 'en');
  assert.equal(languageHarness('auto', ['fr']).currentLanguage(), 'en');
  assert.equal(languageHarness('zh', ['en']).currentLanguage(), 'zh');
  assert.equal(languageHarness('en', ['zh']).currentLanguage(), 'en');
  assert.equal(languageHarness('invalid', ['en']).currentLanguage(), 'en');
});

test('translation interpolates names without translating or altering user content', () => {
  const name = '个人地点 <test> {name}';
  assert.equal(languageHarness('zh').t('已收藏“{name}”。', { name }), `已收藏“${name}”。`);
  assert.equal(languageHarness('en').t('已收藏“{name}”。', { name }), `Saved “${name}”.`);
});

test('all direct translation calls have English entries with matching placeholders', () => {
  const { messages } = languageHarness();
  for (const [, key] of source.matchAll(/\bt\('([^']+)'/g)) {
    assert.ok(Object.hasOwn(messages, key), `Missing English translation: ${key}`);
  }
  const placeholders = (message) => [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [key, value] of Object.entries(messages)) {
    assert.deepEqual(placeholders(key), placeholders(value), `Placeholder mismatch: ${key}`);
  }
});

test('saved place placeholder is generic and language changes preserve form drafts', () => {
  assert.doesNotMatch(source, /UCI|校园/);
  assert.match(source, /id="pw-favorite-name"[^>]+placeholder="\$\{t\('地点名称'\)\}"/);
  assert.match(source, /openSettingsPanel\('overview', drafts\)/);
  assert.match(source, /GM_setValue\(LANGUAGE_KEY, languageSelect.value\)/);
});
