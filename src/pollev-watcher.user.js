// ==UserScript==
// @name         PollEv Watcher
// @author       KKazuhaK
// @namespace    https://github.com/pollev-watcher
// @version      0.3.0
// @description  Notify Telegram when a Poll Everywhere activity becomes active.
// @license      MIT
// @homepageURL  https://github.com/KKazuhaK/pollev-watcher
// @supportURL   https://github.com/KKazuhaK/pollev-watcher/issues
// @downloadURL  https://raw.githubusercontent.com/KKazuhaK/pollev-watcher/main/src/pollev-watcher.user.js
// @updateURL    https://raw.githubusercontent.com/KKazuhaK/pollev-watcher/main/src/pollev-watcher.user.js
// @match        https://pollev.com/*
// @match        https://www.polleverywhere.com/*
// @match        https://pe.app/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      api.telegram.org
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    botToken: 'telegramBotToken',
    chatId: 'telegramChatId',
    enabled: 'watcherEnabled',
  });

  const STATES = Object.freeze({
    unknown: 'unknown',
    waiting: 'waiting',
    active: 'active',
  });

  const WAITING_PATTERNS = [
    /waiting for .+ presentation to begin/i,
    /as soon as the activity is active/i,
    /waiting for the presentation to begin/i,
    /waiting for (?:the )?(?:presenter|host).+to (?:begin|start)/i,
    /waiting for .+ to (?:begin|start)/i,
    /activity (?:has not|hasn't) started/i,
  ];

  const INACTIVE_PATTERNS = [
    /there are no active activities/i,
    /no active activit(?:y|ies)/i,
    /presentation has ended/i,
    /session has ended/i,
  ];

  const CHECK_DELAY_MS = 500;
  const ACTIVE_CONFIRMATION_MS = 1800;
  const TITLE_FLASH_INTERVAL_MS = 900;
  const TITLE_FLASH_DURATION_MS = 30_000;

  let state = STATES.unknown;
  let waitingWasObserved = false;
  let waitingDisappearedAt = 0;
  let checkTimer = null;
  let notificationSent = false;
  let lastActivityFingerprint = '';
  let audioContext = null;

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function bodyText() {
    return normalizeText(document.body?.innerText);
  }

  function matchesAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function detectPageState() {
    const text = bodyText();
    if (!text) return STATES.unknown;
    if (matchesAny(text, WAITING_PATTERNS)) return STATES.waiting;
    if (matchesAny(text, INACTIVE_PATTERNS)) return STATES.unknown;

    const hasActivityControl = Boolean(document.querySelector([
      'input[type="radio"]',
      'input[type="checkbox"]',
      'input[type="text"]',
      'textarea',
      '[role="radio"]',
      '[role="checkbox"]',
      '[contenteditable="true"]',
      'button[type="submit"]',
    ].join(',')));

    if (waitingWasObserved && (hasActivityControl || text.length > 0)) {
      return STATES.active;
    }

    return STATES.unknown;
  }

  function activityFingerprint() {
    const heading = document.querySelector([
      'main h1',
      'main h2',
      '[role="main"] h1',
      '[role="main"] h2',
      '[data-testid*="question"]',
      '[class*="question"] h1',
      '[class*="question"] h2',
    ].join(','));
    const headingText = normalizeText(heading?.innerText || heading?.textContent);
    return headingText ? `${location.pathname}|${headingText}` : '';
  }

  function setBadge(nextState, detail = '') {
    let badge = document.getElementById('pollev-watcher-status');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'pollev-watcher-status';
      Object.assign(badge.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: '2147483647',
        padding: '7px 10px',
        borderRadius: '999px',
        color: '#fff',
        font: '600 12px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        boxShadow: '0 2px 10px rgba(0, 0, 0, .25)',
        pointerEvents: 'none',
        opacity: '.9',
      });
      document.documentElement.appendChild(badge);
    }

    const labels = {
      [STATES.waiting]: 'PollEv Watcher: waiting',
      [STATES.active]: 'PollEv Watcher: active',
      [STATES.unknown]: 'PollEv Watcher: watching',
    };
    const colors = {
      [STATES.waiting]: '#805ad5',
      [STATES.active]: '#16803c',
      [STATES.unknown]: '#4a5568',
    };

    const label = detail || labels[nextState];
    if (badge.textContent !== label) badge.textContent = label;
    if (badge.style.background !== colors[nextState]) {
      badge.style.background = colors[nextState];
    }
  }

  function unlockAudio() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioContext = new AudioContextClass();
    }
    audioContext?.resume().catch(() => {});
  }

  function playAlertSound() {
    if (!audioContext || audioContext.state !== 'running') return;

    [0, 0.22, 0.44].forEach((offset, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime + offset;
      oscillator.frequency.value = index === 1 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  }

  function flashTitle() {
    const originalTitle = document.title;
    let showAlert = true;
    const timer = window.setInterval(() => {
      document.title = showAlert ? '🔔 Poll is active!' : originalTitle;
      showAlert = !showAlert;
    }, TITLE_FLASH_INTERVAL_MS);

    window.setTimeout(() => {
      window.clearInterval(timer);
      document.title = originalTitle;
    }, TITLE_FLASH_DURATION_MS);
  }

  function localNotification(title, text) {
    GM_notification({
      title,
      text,
      timeout: 15_000,
      onclick: () => window.focus(),
    });
  }

  function telegramRequest(method, payload) {
    const token = String(GM_getValue(STORAGE_KEYS.botToken, '')).trim();
    if (!token) return Promise.reject(new Error('Telegram Bot Token is not configured.'));

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `https://api.telegram.org/bot${token}/${method}`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload),
        timeout: 15_000,
        onload(response) {
          let result;
          try {
            result = JSON.parse(response.responseText);
          } catch {
            reject(new Error(`Telegram returned HTTP ${response.status}.`));
            return;
          }

          if (response.status >= 200 && response.status < 300 && result.ok) {
            resolve(result.result);
          } else {
            reject(new Error(result.description || `Telegram returned HTTP ${response.status}.`));
          }
        },
        ontimeout: () => reject(new Error('Telegram request timed out.')),
        onerror: () => reject(new Error('Could not connect to Telegram.')),
      });
    });
  }

  async function sendTelegramMessage(text) {
    const chatId = String(GM_getValue(STORAGE_KEYS.chatId, '')).trim();
    if (!chatId) throw new Error('Telegram Chat ID is not configured.');

    return telegramRequest('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
  }

  async function detectLatestTelegramChat() {
    const updates = await telegramRequest('getUpdates', {
      limit: 100,
      timeout: 0,
      allowed_updates: ['message'],
    });
    const chats = updates
      .map((update) => update.message?.chat)
      .filter(Boolean)
      .reverse();
    return chats.find((chat) => chat.type === 'private') || chats[0] || null;
  }

  async function notifyActivityActive(isNextQuestion = false) {
    if (notificationSent && !isNextQuestion) return;
    notificationSent = true;

    const message = [
      isNextQuestion ? '🔔 Poll Everywhere 新题已开启' : '🔔 Poll Everywhere 已开启',
      document.title ? `页面：${document.title}` : '',
      `链接：${location.href}`,
    ].filter(Boolean).join('\n');

    setBadge(STATES.active);
    localNotification(
      isNextQuestion ? 'Poll Everywhere 新题已开启' : 'Poll Everywhere 已开启',
      '活动现在可以作答了。',
    );
    playAlertSound();
    flashTitle();

    try {
      await sendTelegramMessage(message);
    } catch (error) {
      console.warn('[PollEv Watcher] Telegram notification failed:', error.message);
      localNotification('Telegram 通知发送失败', error.message);
      setBadge(STATES.active, 'PollEv Watcher: Telegram failed');
    }
  }

  function evaluateState() {
    if (!GM_getValue(STORAGE_KEYS.enabled, true)) {
      setBadge(STATES.unknown, 'PollEv Watcher: paused');
      return;
    }

    const detected = detectPageState();
    const now = Date.now();

    if (detected === STATES.waiting) {
      state = STATES.waiting;
      waitingWasObserved = true;
      waitingDisappearedAt = 0;
      notificationSent = false;
      lastActivityFingerprint = '';
      setBadge(state);
      return;
    }

    if (waitingWasObserved && state === STATES.waiting && detected !== STATES.waiting) {
      waitingDisappearedAt ||= now;
      if (now - waitingDisappearedAt < ACTIVE_CONFIRMATION_MS) {
        scheduleCheck();
        return;
      }
      state = STATES.active;
      lastActivityFingerprint = activityFingerprint();
      void notifyActivityActive();
      return;
    }

    if (state === STATES.active && detected === STATES.active) {
      const fingerprint = activityFingerprint();
      if (fingerprint && lastActivityFingerprint && fingerprint !== lastActivityFingerprint) {
        lastActivityFingerprint = fingerprint;
        void notifyActivityActive(true);
      } else if (fingerprint && !lastActivityFingerprint) {
        lastActivityFingerprint = fingerprint;
      }
      return;
    }

    if (state !== STATES.active) {
      state = detected;
      setBadge(state);
    }
  }

  function scheduleCheck() {
    window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(evaluateState, CHECK_DELAY_MS);
  }

  async function configureTelegram() {
    const currentToken = String(GM_getValue(STORAGE_KEYS.botToken, '')).trim();
    const token = window.prompt(
      currentToken
        ? '输入新的 Telegram Bot Token，或留空以保留当前 Token。Token 只保存在 Tampermonkey 中。'
        : '输入 Telegram Bot Token。它只会保存在 Tampermonkey 中。',
      '',
    );
    if (token === null) return;
    const nextToken = token.trim() || currentToken;
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(nextToken)) {
      window.alert('Token 格式看起来不正确。请从 @BotFather 复制完整 Token。');
      return;
    }
    GM_setValue(STORAGE_KEYS.botToken, nextToken);

    const currentChatId = String(GM_getValue(STORAGE_KEYS.chatId, ''));
    let detectedChat = null;
    try {
      detectedChat = await detectLatestTelegramChat();
    } catch (error) {
      console.warn('[PollEv Watcher] Could not detect a Telegram chat:', error.message);
    }
    const suggestedChatId = detectedChat?.id ? String(detectedChat.id) : currentChatId;
    const detectedName = detectedChat
      ? normalizeText([detectedChat.first_name, detectedChat.last_name, detectedChat.title]
        .filter(Boolean).join(' '))
      : '';
    const chatId = window.prompt(
      detectedChat
        ? `检测到 Telegram 对话${detectedName ? `（${detectedName}）` : ''}。请确认 Chat ID。`
        : '未能自动检测 Chat ID。请先给机器人发送 /start，再重新配置；也可以手动输入数字 ID。',
      suggestedChatId,
    );
    if (chatId === null) return;
    if (!/^-?\d+$/.test(chatId.trim())) {
      window.alert('Chat ID 应该是一串数字。');
      return;
    }
    GM_setValue(STORAGE_KEYS.chatId, chatId.trim());
    window.alert('Telegram 配置已保存。请从 Tampermonkey 菜单发送测试通知。');
  }

  async function testTelegram() {
    try {
      await sendTelegramMessage(`✅ PollEv Watcher 测试成功\n${location.href}`);
      localNotification('PollEv Watcher', 'Telegram 测试消息已发送。');
    } catch (error) {
      window.alert(`发送失败：${error.message}`);
    }
  }

  function toggleWatcher() {
    const enabled = !GM_getValue(STORAGE_KEYS.enabled, true);
    GM_setValue(STORAGE_KEYS.enabled, enabled);
    window.alert(`PollEv Watcher 已${enabled ? '开启' : '暂停'}。`);
    evaluateState();
  }

  function clearTelegramConfig() {
    if (!window.confirm('确定要删除保存在 Tampermonkey 中的 Bot Token 和 Chat ID 吗？')) return;
    GM_deleteValue(STORAGE_KEYS.botToken);
    GM_deleteValue(STORAGE_KEYS.chatId);
    window.alert('Telegram 配置已删除。');
  }

  GM_registerMenuCommand('⚙️ 配置 Telegram', () => void configureTelegram());
  GM_registerMenuCommand('🧪 发送 Telegram 测试通知', () => void testTelegram());
  GM_registerMenuCommand('⏯️ 开启/暂停监听', toggleWatcher);
  GM_registerMenuCommand('🗑️ 删除 Telegram 配置', clearTelegramConfig);

  document.addEventListener('click', unlockAudio, { once: true, capture: true });
  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  setBadge(STATES.unknown);
  evaluateState();
  window.setInterval(evaluateState, 15_000);
}());
