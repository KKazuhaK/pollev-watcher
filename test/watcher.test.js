const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'src', 'pollev-watcher.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function createHarness() {
  let now = 1_000;
  let observerCallback;
  let evaluateInterval;
  let telegramMessages = 0;
  let localAlerts = 0;
  let questionTitle = '';
  const elements = new Map();

  const document = {
    body: { innerText: '' },
    title: 'Test presentation',
    documentElement: {
      appendChild(element) {
        elements.set(element.id, element);
      },
    },
    addEventListener() {},
    createElement() {
      return { id: '', style: {}, textContent: '' };
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(selector) {
      if (selector.includes('main h1')) {
        return questionTitle ? { innerText: questionTitle, textContent: questionTitle } : null;
      }
      return document.body.innerText.includes('Question') ? {} : null;
    },
  };

  const values = new Map([
    ['telegramBotToken', 'test-token'],
    ['telegramChatId', '12345678'],
  ]);

  const context = {
    console,
    Date: { now: () => now },
    document,
    location: { href: 'https://pollev.com/test' },
    MutationObserver: class {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
    },
    GM_deleteValue: (key) => values.delete(key),
    GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    GM_notification: () => { localAlerts += 1; },
    GM_registerMenuCommand: () => {},
    GM_setValue: (key, value) => values.set(key, value),
    GM_xmlhttpRequest: (options) => {
      telegramMessages += 1;
      options.onload({ status: 200, responseText: '{"ok":true,"result":{}}' });
    },
    window: {
      alert() {},
      confirm: () => true,
      focus() {},
      prompt: () => null,
      clearInterval() {},
      clearTimeout() {},
      setInterval(callback) {
        evaluateInterval ||= callback;
        return 1;
      },
      setTimeout() {
        return 1;
      },
    },
  };

  context.window.document = document;
  context.window.location = context.location;
  vm.runInNewContext(source, context);

  return {
    activate() {
      questionTitle ||= 'Question one';
      document.body.innerText = 'Question: choose an answer';
      evaluateInterval();
      now += 2_000;
      evaluateInterval();
    },
    nextQuestion(title) {
      questionTitle = title;
      document.body.innerText = `Question: ${title}`;
      evaluateInterval();
    },
    wait() {
      document.body.innerText = 'Waiting for the presentation to begin';
      observerCallback();
      evaluateInterval();
    },
    counts: () => ({ telegramMessages, localAlerts }),
  };
}

test('metadata includes both Poll Everywhere participant domains', () => {
  assert.match(source, /@match\s+https:\/\/pollev\.com\/\*/);
  assert.match(source, /@match\s+https:\/\/pe\.app\/\*/);
});

test('each waiting-to-active transition sends one notification', async () => {
  const harness = createHarness();

  harness.wait();
  harness.activate();
  assert.equal(harness.counts().telegramMessages, 1);

  harness.wait();
  harness.activate();
  assert.equal(harness.counts().telegramMessages, 2);
  assert.equal(harness.counts().localAlerts, 2);
});

test('a changed question heading sends one additional notification', () => {
  const harness = createHarness();

  harness.wait();
  harness.activate();
  harness.nextQuestion('Question two');
  harness.nextQuestion('Question two');

  assert.equal(harness.counts().telegramMessages, 2);
  assert.equal(harness.counts().localAlerts, 2);
});
