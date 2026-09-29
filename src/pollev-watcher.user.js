// ==UserScript==
// @name         PollEv Watcher
// @author       KKazuhaK
// @namespace    https://github.com/pollev-watcher
// @version      0.5.0
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
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        unsafeWindow
// @require      https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
// @resource     leafletCSS https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
// @connect      api.telegram.org
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    botToken: 'telegramBotToken',
    chatId: 'telegramChatId',
    enabled: 'watcherEnabled',
    locationEnabled: 'locationMockEnabled',
    latitude: 'locationMockLatitude',
    longitude: 'locationMockLongitude',
    accuracy: 'locationMockAccuracy',
    locationErrorCode: 'locationMockErrorCode',
  });

  const LOCATION_DEFAULTS = Object.freeze({
    enabled: false,
    latitude: 33.6405,
    longitude: -117.8443,
    accuracy: 10,
    errorCode: 0,
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
  let settingsMenuId = null;
  let leafletCssAdded = false;

  const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
  const geolocation = pageWindow.navigator?.geolocation;
  const mockWatches = new Map();
  let nextMockWatchId = -1;

  function locationSetting(key) {
    const storageKey = key === 'enabled'
      ? STORAGE_KEYS.locationEnabled
      : key === 'errorCode'
        ? STORAGE_KEYS.locationErrorCode
        : STORAGE_KEYS[key];
    return GM_getValue(storageKey, LOCATION_DEFAULTS[key]);
  }

  function isLocationMockEnabled() {
    return Boolean(locationSetting('enabled'));
  }

  function settingsMenuLabel() {
    const watcher = GM_getValue(STORAGE_KEYS.enabled, true) ? '已开启' : '已关闭';
    const locationMock = isLocationMockEnabled() ? '已开启' : '已关闭';
    return `🎛️ Watcher 设置 [检测${watcher}] [定位${locationMock}]`;
  }

  function refreshSettingsMenu() {
    const options = settingsMenuId === null ? undefined : { id: settingsMenuId };
    settingsMenuId = GM_registerMenuCommand(settingsMenuLabel(), openSettingsPanel, options);
  }

  function buildMockPosition() {
    return {
      coords: {
        latitude: Number(locationSetting('latitude')),
        longitude: Number(locationSetting('longitude')),
        accuracy: Number(locationSetting('accuracy')),
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
  }

  function buildMockPositionError(code) {
    const messages = {
      1: 'User denied Geolocation',
      2: 'Position unavailable',
      3: 'Geolocation request timed out',
    };
    return {
      code,
      message: messages[code] || 'Unknown geolocation error',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
  }

  function installGeolocationMock() {
    if (!geolocation) return;

    const native = Object.freeze({
      getCurrentPosition: geolocation.getCurrentPosition.bind(geolocation),
      watchPosition: geolocation.watchPosition.bind(geolocation),
      clearWatch: geolocation.clearWatch.bind(geolocation),
    });
    const geolocationPrototype = pageWindow.Geolocation?.prototype
      || Object.getPrototypeOf(geolocation);

    function deliverPosition(success, error) {
      const errorCode = Number(locationSetting('errorCode'));
      pageWindow.setTimeout(() => {
        if (errorCode) {
          if (typeof error === 'function') error(buildMockPositionError(errorCode));
        } else if (typeof success === 'function') {
          success(buildMockPosition());
        }
      }, 0);
    }

    function getCurrentPosition(success, error, options) {
      if (!isLocationMockEnabled()) return native.getCurrentPosition(success, error, options);
      deliverPosition(success, error);
    }

    function watchPosition(success, error, options) {
      if (!isLocationMockEnabled()) return native.watchPosition(success, error, options);
      const watchId = nextMockWatchId;
      nextMockWatchId -= 1;
      deliverPosition(success, error);
      const timer = pageWindow.setInterval(() => deliverPosition(success, error), 5_000);
      mockWatches.set(watchId, timer);
      return watchId;
    }

    function clearWatch(watchId) {
      if (mockWatches.has(watchId)) {
        pageWindow.clearInterval(mockWatches.get(watchId));
        mockWatches.delete(watchId);
        return;
      }
      native.clearWatch(watchId);
    }

    function installMethod(target, name, value) {
      if (!target) return;
      try {
        Object.defineProperty(target, name, {
          configurable: true,
          writable: true,
          value,
        });
      } catch {
        try { target[name] = value; } catch { /* read-only host object */ }
      }
    }

    for (const [name, value] of Object.entries({ getCurrentPosition, watchPosition, clearWatch })) {
      installMethod(geolocationPrototype, name, value);
      installMethod(geolocation, name, value);
    }
  }

  installGeolocationMock();

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

  function updateLocationBadge() {
    const existing = document.getElementById('pollev-location-mock-status');
    if (!isLocationMockEnabled()) {
      existing?.remove();
      return;
    }
    if (!document.documentElement) return;

    const badge = existing || document.createElement('div');
    badge.id = 'pollev-location-mock-status';
    badge.textContent = Number(locationSetting('errorCode'))
      ? `Location mock: error ${locationSetting('errorCode')}`
      : `Location mock: ${Number(locationSetting('latitude')).toFixed(4)}, ${Number(locationSetting('longitude')).toFixed(4)}`;
    Object.assign(badge.style, {
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      zIndex: '2147483647',
      padding: '7px 10px',
      borderRadius: '999px',
      color: '#fff',
      background: '#b83280',
      font: '600 12px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      boxShadow: '0 2px 10px rgba(0, 0, 0, .25)',
      pointerEvents: 'none',
      opacity: '.92',
    });
    if (!existing) document.documentElement.appendChild(badge);
  }

  function testLocationMock() {
    if (!geolocation) {
      window.alert('当前浏览器没有提供 Geolocation API。');
      return;
    }
    pageWindow.navigator.geolocation.getCurrentPosition(
      (position) => window.alert([
        `Latitude: ${position.coords.latitude}`,
        `Longitude: ${position.coords.longitude}`,
        `Accuracy: ${position.coords.accuracy} m`,
      ].join('\n')),
      (error) => window.alert(`Geolocation error ${error.code}: ${error.message}`),
    );
  }

  function openSettingsPanel() {
    document.getElementById('pollev-watcher-settings')?.remove();

    if (!leafletCssAdded) {
      GM_addStyle(GM_getResourceText('leafletCSS'));
      leafletCssAdded = true;
    }

    const overlay = document.createElement('div');
    overlay.id = 'pollev-watcher-settings';
    overlay.innerHTML = `
      <style>
        #pollev-watcher-settings {
          position: fixed; inset: 0; z-index: 2147483647;
          display: grid; place-items: center; padding: 20px;
          background: rgba(15, 23, 42, .58);
          font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #172033;
        }
        #pollev-watcher-settings * { box-sizing: border-box; }
        #pollev-watcher-settings .pw-card {
          width: min(560px, 100%); max-height: calc(100vh - 40px); overflow: auto;
          padding: 22px; border-radius: 16px;
          background: #fff; box-shadow: 0 22px 70px rgba(0, 0, 0, .32);
        }
        #pollev-watcher-settings .pw-title {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 18px; font-size: 20px; font-weight: 750;
        }
        #pollev-watcher-settings .pw-close {
          border: 0; background: transparent; color: #64748b;
          font-size: 26px; line-height: 1; cursor: pointer;
        }
        #pollev-watcher-settings .pw-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; padding: 13px 0; border-top: 1px solid #e5e7eb;
        }
        #pollev-watcher-settings .pw-label { font-weight: 650; }
        #pollev-watcher-settings .pw-note { color: #64748b; font-size: 12px; }
        #pollev-watcher-settings .pw-switch { position: relative; width: 48px; height: 28px; flex: 0 0 auto; }
        #pollev-watcher-settings .pw-switch input { position: absolute; opacity: 0; pointer-events: none; }
        #pollev-watcher-settings .pw-slider {
          position: absolute; inset: 0; border-radius: 999px; cursor: pointer;
          background: #cbd5e1; transition: .18s ease;
        }
        #pollev-watcher-settings .pw-slider::after {
          content: ""; position: absolute; width: 22px; height: 22px;
          left: 3px; top: 3px; border-radius: 50%; background: #fff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, .25); transition: .18s ease;
        }
        #pollev-watcher-settings input:checked + .pw-slider { background: #16a34a; }
        #pollev-watcher-settings input:checked + .pw-slider::after { transform: translateX(20px); }
        #pollev-watcher-settings .pw-grid {
          display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 12px 0;
        }
        #pollev-watcher-settings .pw-map-label { margin: 14px 0 6px; color: #475569; font-size: 12px; }
        #pollev-watcher-settings .pw-map { height: 240px; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; }
        #pollev-watcher-settings .pw-map-pin {
          width: 26px !important; height: 36px !important; margin: 0 !important;
          border: 0; background: transparent;
        }
        #pollev-watcher-settings .pw-map-pin::before {
          content: ""; display: block; width: 24px; height: 24px;
          border: 3px solid #fff; border-radius: 50% 50% 50% 0;
          background: #dc2626; box-shadow: 0 2px 7px rgba(0, 0, 0, .35);
          transform: rotate(-45deg);
        }
        #pollev-watcher-settings .leaflet-control-attribution { font-size: 9px; }
        #pollev-watcher-settings .pw-field label { display: block; margin-bottom: 4px; color: #475569; font-size: 12px; }
        #pollev-watcher-settings input[type="number"], #pollev-watcher-settings select {
          width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
        }
        #pollev-watcher-settings .pw-actions { display: flex; gap: 9px; margin-top: 14px; }
        #pollev-watcher-settings .pw-button {
          padding: 9px 13px; border: 0; border-radius: 9px; cursor: pointer;
          background: #e2e8f0; color: #172033; font-weight: 650;
        }
        #pollev-watcher-settings .pw-primary { background: #2563eb; color: #fff; }
        #pollev-watcher-settings .pw-status { min-height: 19px; margin-top: 10px; color: #475569; font-size: 12px; }
      </style>
      <div class="pw-card" role="dialog" aria-modal="true" aria-labelledby="pw-settings-title">
        <div class="pw-title"><span id="pw-settings-title">PollEv Watcher 设置</span><button class="pw-close" aria-label="关闭">×</button></div>
        <div class="pw-row">
          <div><div class="pw-label">活动开启提醒</div><div class="pw-note">Telegram、桌面通知、声音和标题闪烁</div></div>
          <label class="pw-switch"><input id="pw-watch-toggle" type="checkbox"><span class="pw-slider"></span></label>
        </div>
        <div class="pw-row">
          <div><div class="pw-label">定位模拟</div><div class="pw-note">仅作用于 Poll Everywhere 页面；更改后建议刷新</div></div>
          <label class="pw-switch"><input id="pw-location-toggle" type="checkbox"><span class="pw-slider"></span></label>
        </div>
        <div class="pw-map-label">点击地图选择位置，或拖动红色标记</div>
        <div class="pw-map" id="pw-location-map"></div>
        <div class="pw-grid">
          <div class="pw-field"><label for="pw-latitude">Latitude</label><input id="pw-latitude" type="number" min="-90" max="90" step="any"></div>
          <div class="pw-field"><label for="pw-longitude">Longitude</label><input id="pw-longitude" type="number" min="-180" max="180" step="any"></div>
          <div class="pw-field"><label for="pw-accuracy">Accuracy (m)</label><input id="pw-accuracy" type="number" min="0.1" step="any"></div>
        </div>
        <div class="pw-field"><label for="pw-error-mode">定位结果</label><select id="pw-error-mode"><option value="0">成功</option><option value="1">权限被拒绝</option><option value="2">位置不可用</option><option value="3">请求超时</option></select></div>
        <div class="pw-actions"><button class="pw-button pw-primary" id="pw-save-location">保存定位设置</button><button class="pw-button" id="pw-test-location">自检</button></div>
        <div class="pw-status" id="pw-settings-status"></div>
      </div>`;

    const watchToggle = overlay.querySelector('#pw-watch-toggle');
    const locationToggle = overlay.querySelector('#pw-location-toggle');
    const latitude = overlay.querySelector('#pw-latitude');
    const longitude = overlay.querySelector('#pw-longitude');
    const accuracy = overlay.querySelector('#pw-accuracy');
    const errorMode = overlay.querySelector('#pw-error-mode');
    const status = overlay.querySelector('#pw-settings-status');

    watchToggle.checked = Boolean(GM_getValue(STORAGE_KEYS.enabled, true));
    locationToggle.checked = isLocationMockEnabled();
    latitude.value = String(locationSetting('latitude'));
    longitude.value = String(locationSetting('longitude'));
    accuracy.value = String(locationSetting('accuracy'));
    errorMode.value = String(locationSetting('errorCode'));

    (document.body || document.documentElement).appendChild(overlay);

    const leaflet = typeof L === 'undefined' ? null : L;
    if (leaflet) {
      const initialPosition = [Number(latitude.value), Number(longitude.value)];
      const map = leaflet.map(overlay.querySelector('#pw-location-map')).setView(initialPosition, 15);
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const marker = leaflet.marker(initialPosition, {
        draggable: true,
        autoPan: true,
        title: '拖动选择位置',
        icon: leaflet.divIcon({ className: 'pw-map-pin', iconSize: [26, 36], iconAnchor: [13, 34] }),
      }).addTo(map);

      const selectPosition = (position) => {
        latitude.value = Number(position.lat).toFixed(6);
        longitude.value = Number(position.lng).toFixed(6);
        marker.setLatLng(position);
        status.textContent = '地图位置已选择；点击“保存定位设置”后生效。';
      };
      map.on('click', (event) => selectPosition(event.latlng));
      marker.on('dragend', () => selectPosition(marker.getLatLng()));
      window.setTimeout(() => map.invalidateSize(), 0);
    } else {
      status.textContent = '地图组件加载失败，仍可手动输入坐标。';
    }

    overlay.querySelector('.pw-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    watchToggle.addEventListener('change', () => {
      GM_setValue(STORAGE_KEYS.enabled, watchToggle.checked);
      evaluateState();
      refreshSettingsMenu();
      status.textContent = `活动提醒已${watchToggle.checked ? '开启' : '暂停'}。`;
    });
    locationToggle.addEventListener('change', () => {
      GM_setValue(STORAGE_KEYS.locationEnabled, locationToggle.checked);
      updateLocationBadge();
      refreshSettingsMenu();
      status.textContent = `定位模拟已${locationToggle.checked ? '开启' : '关闭'}。请刷新页面后重新检查定位。`;
    });
    overlay.querySelector('#pw-save-location').addEventListener('click', () => {
      const values = {
        latitude: Number(latitude.value),
        longitude: Number(longitude.value),
        accuracy: Number(accuracy.value),
        errorCode: Number(errorMode.value),
      };
      if (!Number.isFinite(values.latitude) || values.latitude < -90 || values.latitude > 90
        || !Number.isFinite(values.longitude) || values.longitude < -180 || values.longitude > 180
        || !Number.isFinite(values.accuracy) || values.accuracy <= 0
        || ![0, 1, 2, 3].includes(values.errorCode)) {
        status.textContent = '坐标、精度或错误模式格式不正确。';
        return;
      }
      GM_setValue(STORAGE_KEYS.latitude, values.latitude);
      GM_setValue(STORAGE_KEYS.longitude, values.longitude);
      GM_setValue(STORAGE_KEYS.accuracy, values.accuracy);
      GM_setValue(STORAGE_KEYS.locationErrorCode, values.errorCode);
      updateLocationBadge();
      status.textContent = '定位设置已保存。请刷新页面后重新检查定位。';
    });
    overlay.querySelector('#pw-test-location').addEventListener('click', testLocationMock);

  }

  function clearTelegramConfig() {
    if (!window.confirm('确定要删除保存在 Tampermonkey 中的 Bot Token 和 Chat ID 吗？')) return;
    GM_deleteValue(STORAGE_KEYS.botToken);
    GM_deleteValue(STORAGE_KEYS.chatId);
    window.alert('Telegram 配置已删除。');
  }

  GM_registerMenuCommand('⚙️ 配置 Telegram', () => void configureTelegram());
  GM_registerMenuCommand('🧪 发送 Telegram 测试通知', () => void testTelegram());
  refreshSettingsMenu();
  GM_registerMenuCommand('🗑️ 删除 Telegram 配置', clearTelegramConfig);

  function startWatcher() {
    document.addEventListener('click', unlockAudio, { once: true, capture: true });
    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    setBadge(STATES.unknown);
    updateLocationBadge();
    evaluateState();
    window.setInterval(evaluateState, 15_000);
  }

  if (document.documentElement) startWatcher();
  else document.addEventListener('readystatechange', startWatcher, { once: true });
}());
