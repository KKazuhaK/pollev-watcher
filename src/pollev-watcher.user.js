// ==UserScript==
// @name         PollEv Watcher
// @author       KKazuhaK
// @namespace    https://github.com/pollev-watcher
// @version      0.6.0
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
// @grant        GM_unregisterMenuCommand
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
    notificationsEnabled: 'notificationsEnabled',
    locationEnabled: 'locationMockEnabled',
    latitude: 'locationMockLatitude',
    longitude: 'locationMockLongitude',
    accuracy: 'locationMockAccuracy',
    locationErrorCode: 'locationMockErrorCode',
    locationConfigured: 'locationMockConfigured',
    savedLocations: 'locationMockSavedLocations',
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
  let watcherToggleMenuId = null;
  let notificationToggleMenuId = null;
  let locationToggleMenuId = null;
  let settingsMenuId = null;
  let savedLocationMenuIds = [];
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

  function isTelegramConfigured() {
    const token = String(GM_getValue(STORAGE_KEYS.botToken, '')).trim();
    const chatId = String(GM_getValue(STORAGE_KEYS.chatId, '')).trim();
    return /^\d+:[A-Za-z0-9_-]+$/.test(token) && /^-?\d+$/.test(chatId);
  }

  function isLocationConfigured() {
    const explicitlyConfigured = GM_getValue(STORAGE_KEYS.locationConfigured, null);
    if (typeof explicitlyConfigured === 'boolean') return explicitlyConfigured;
    const latitude = GM_getValue(STORAGE_KEYS.latitude, null);
    const longitude = GM_getValue(STORAGE_KEYS.longitude, null);
    const accuracy = GM_getValue(STORAGE_KEYS.accuracy, null);
    return Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90
      && Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180
      && Number.isFinite(Number(accuracy)) && Number(accuracy) > 0;
  }

  function savedLocations() {
    const locations = GM_getValue(STORAGE_KEYS.savedLocations, []);
    if (!Array.isArray(locations)) return [];
    return locations.filter((location) => location
      && typeof location.id === 'string'
      && typeof location.name === 'string'
      && Number.isFinite(Number(location.latitude))
      && Number(location.latitude) >= -90
      && Number(location.latitude) <= 90
      && Number.isFinite(Number(location.longitude))
      && Number(location.longitude) >= -180
      && Number(location.longitude) <= 180
      && Number.isFinite(Number(location.accuracy))
      && Number(location.accuracy) > 0);
  }

  function storeSavedLocations(locations) {
    GM_setValue(STORAGE_KEYS.savedLocations, locations);
  }

  function activateSavedLocation(location) {
    GM_setValue(STORAGE_KEYS.latitude, Number(location.latitude));
    GM_setValue(STORAGE_KEYS.longitude, Number(location.longitude));
    GM_setValue(STORAGE_KEYS.accuracy, Number(location.accuracy));
    GM_setValue(STORAGE_KEYS.locationErrorCode, 0);
    GM_setValue(STORAGE_KEYS.locationConfigured, true);
    GM_setValue(STORAGE_KEYS.locationEnabled, true);
    updateLocationBadge();
    refreshControlMenus();
  }

  function watcherToggleMenuLabel() {
    const enabled = Boolean(GM_getValue(STORAGE_KEYS.enabled, true));
    return `⏯️ 监测 [${enabled ? '已开启' : '已关闭'}]`;
  }

  function locationToggleMenuLabel() {
    if (!isLocationConfigured()) return '📍 定位 [未配置]';
    const enabled = isLocationMockEnabled();
    return `📍 定位 [${enabled ? '已开启' : '已关闭'}]`;
  }

  function notificationToggleMenuLabel() {
    if (!isTelegramConfigured()) return '🔔 通知 [未配置]';
    const enabled = Boolean(GM_getValue(STORAGE_KEYS.notificationsEnabled, true));
    return `🔔 通知 [${enabled ? '已开启' : '已关闭'}]`;
  }

  function toggleWatcherFromMenu() {
    GM_setValue(STORAGE_KEYS.enabled, !GM_getValue(STORAGE_KEYS.enabled, true));
    evaluateState();
    refreshControlMenus();
  }

  function toggleLocationFromMenu() {
    if (!isLocationConfigured()) {
      openSettingsPanel('location');
      return;
    }
    GM_setValue(STORAGE_KEYS.locationEnabled, !isLocationMockEnabled());
    updateLocationBadge();
    refreshControlMenus();
  }

  function toggleNotificationsFromMenu() {
    if (!isTelegramConfigured()) {
      openSettingsPanel('notifications');
      return;
    }
    GM_setValue(
      STORAGE_KEYS.notificationsEnabled,
      !GM_getValue(STORAGE_KEYS.notificationsEnabled, true),
    );
    refreshControlMenus();
  }

  function refreshControlMenus() {
    watcherToggleMenuId = GM_registerMenuCommand(
      watcherToggleMenuLabel(),
      toggleWatcherFromMenu,
      watcherToggleMenuId === null ? undefined : { id: watcherToggleMenuId },
    );
    notificationToggleMenuId = GM_registerMenuCommand(
      notificationToggleMenuLabel(),
      toggleNotificationsFromMenu,
      notificationToggleMenuId === null ? undefined : { id: notificationToggleMenuId },
    );
    locationToggleMenuId = GM_registerMenuCommand(
      locationToggleMenuLabel(),
      toggleLocationFromMenu,
      locationToggleMenuId === null ? undefined : { id: locationToggleMenuId },
    );
    settingsMenuId = GM_registerMenuCommand(
      '🎛️ 打开 Watcher 设置',
      openSettingsPanel,
      settingsMenuId === null ? undefined : { id: settingsMenuId },
    );
    savedLocationMenuIds.forEach((id) => GM_unregisterMenuCommand(id));
    savedLocationMenuIds = savedLocations().map((location) => GM_registerMenuCommand(
      `📌 ${location.name}`,
      () => activateSavedLocation(location),
    ));
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

  function telegramRequest(method, payload, tokenOverride = '') {
    const token = String(tokenOverride || GM_getValue(STORAGE_KEYS.botToken, '')).trim();
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

  async function detectLatestTelegramChat(tokenOverride = '') {
    const updates = await telegramRequest('getUpdates', {
      limit: 100,
      timeout: 0,
      allowed_updates: ['message'],
    }, tokenOverride);
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
    if (!GM_getValue(STORAGE_KEYS.notificationsEnabled, true)) return;

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

  function openSettingsPanel(initialSection = 'overview') {
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
          position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
          padding: 20px; background: rgba(15, 23, 42, .62);
          color: #172033; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        #pollev-watcher-settings * { box-sizing: border-box; }
        #pollev-watcher-settings .pw-shell {
          display: grid; grid-template-columns: 190px minmax(0, 1fr); width: min(900px, 100%);
          height: min(680px, calc(100vh - 40px)); overflow: hidden; border: 1px solid rgba(255,255,255,.55);
          border-radius: 18px; background: #fff; box-shadow: 0 24px 80px rgba(0, 0, 0, .36);
        }
        #pollev-watcher-settings .pw-sidebar {
          display: flex; flex-direction: column; padding: 20px 14px; color: #e2e8f0;
          background: linear-gradient(180deg, #172554 0%, #1e3a8a 100%);
        }
        #pollev-watcher-settings .pw-brand { padding: 0 10px 18px; color: #fff; font-size: 17px; font-weight: 750; }
        #pollev-watcher-settings .pw-brand small { display: block; margin-top: 3px; color: #93c5fd; font-size: 11px; font-weight: 500; }
        #pollev-watcher-settings .pw-nav { display: grid; gap: 5px; }
        #pollev-watcher-settings .pw-nav-button {
          width: 100%; padding: 10px 11px; border: 0; border-radius: 9px; text-align: left;
          color: #cbd5e1; background: transparent; cursor: pointer; font: inherit; font-weight: 650;
        }
        #pollev-watcher-settings .pw-nav-button:hover { background: rgba(255,255,255,.09); color: #fff; }
        #pollev-watcher-settings .pw-nav-button.is-active { color: #fff; background: rgba(59,130,246,.42); }
        #pollev-watcher-settings .pw-sidebar-note { margin-top: auto; padding: 14px 10px 0; color: #93c5fd; font-size: 11px; }
        #pollev-watcher-settings .pw-main { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; }
        #pollev-watcher-settings .pw-header {
          display: flex; align-items: center; justify-content: space-between; min-height: 68px;
          padding: 0 24px; border-bottom: 1px solid #e5e7eb;
        }
        #pollev-watcher-settings .pw-header h2 { margin: 0; font-size: 20px; }
        #pollev-watcher-settings .pw-close {
          width: 34px; height: 34px; border: 0; border-radius: 9px; color: #64748b;
          background: #f1f5f9; cursor: pointer; font-size: 23px; line-height: 1;
        }
        #pollev-watcher-settings .pw-content { overflow: auto; padding: 22px 24px; background: #f8fafc; }
        #pollev-watcher-settings .pw-panel { display: none; }
        #pollev-watcher-settings .pw-panel.is-active { display: block; }
        #pollev-watcher-settings .pw-section-title { margin: 0 0 4px; font-size: 17px; }
        #pollev-watcher-settings .pw-section-note { margin: 0 0 18px; color: #64748b; font-size: 12px; }
        #pollev-watcher-settings .pw-card {
          margin-bottom: 12px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff;
        }
        #pollev-watcher-settings .pw-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
        #pollev-watcher-settings .pw-label { font-weight: 700; }
        #pollev-watcher-settings .pw-note { color: #64748b; font-size: 12px; }
        #pollev-watcher-settings .pw-badge {
          display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 999px;
          color: #166534; background: #dcfce7; font-size: 11px; font-weight: 700;
        }
        #pollev-watcher-settings .pw-badge.is-unconfigured { color: #92400e; background: #fef3c7; }
        #pollev-watcher-settings .pw-switch { position: relative; width: 48px; height: 28px; flex: 0 0 auto; }
        #pollev-watcher-settings .pw-switch input { position: absolute; opacity: 0; pointer-events: none; }
        #pollev-watcher-settings .pw-slider { position: absolute; inset: 0; border-radius: 999px; cursor: pointer; background: #cbd5e1; transition: .18s ease; }
        #pollev-watcher-settings .pw-slider::after {
          content: ""; position: absolute; left: 3px; top: 3px; width: 22px; height: 22px;
          border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); transition: .18s ease;
        }
        #pollev-watcher-settings input:checked + .pw-slider { background: #16a34a; }
        #pollev-watcher-settings input:checked + .pw-slider::after { transform: translateX(20px); }
        #pollev-watcher-settings input:disabled + .pw-slider { cursor: not-allowed; opacity: .55; }
        #pollev-watcher-settings .pw-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        #pollev-watcher-settings .pw-location-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 12px; }
        #pollev-watcher-settings .pw-field label { display: block; margin-bottom: 5px; color: #475569; font-size: 12px; font-weight: 650; }
        #pollev-watcher-settings input[type="number"], #pollev-watcher-settings input[type="text"],
        #pollev-watcher-settings input[type="password"], #pollev-watcher-settings select {
          width: 100%; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 8px; color: #172033; background: #fff;
        }
        #pollev-watcher-settings input:focus, #pollev-watcher-settings select:focus { outline: 2px solid #bfdbfe; border-color: #3b82f6; }
        #pollev-watcher-settings .pw-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        #pollev-watcher-settings .pw-button {
          padding: 9px 13px; border: 0; border-radius: 9px; color: #172033;
          background: #e2e8f0; cursor: pointer; font-weight: 650;
        }
        #pollev-watcher-settings .pw-button:disabled { cursor: not-allowed; opacity: .55; }
        #pollev-watcher-settings .pw-primary { color: #fff; background: #2563eb; }
        #pollev-watcher-settings .pw-danger { color: #b91c1c; background: #fee2e2; }
        #pollev-watcher-settings .pw-map-label { margin: 14px 0 7px; color: #475569; font-size: 12px; }
        #pollev-watcher-settings .pw-map { height: 300px; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 11px; background: #e2e8f0; }
        #pollev-watcher-settings .pw-map-pin { width: 26px !important; height: 36px !important; margin: 0 !important; border: 0; background: transparent; }
        #pollev-watcher-settings .pw-map-pin::before {
          content: ""; display: block; width: 24px; height: 24px; border: 3px solid #fff;
          border-radius: 50% 50% 50% 0; background: #dc2626; box-shadow: 0 2px 7px rgba(0,0,0,.35); transform: rotate(-45deg);
        }
        #pollev-watcher-settings .leaflet-control-attribution { font-size: 9px; }
        #pollev-watcher-settings .pw-favorite-compose { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
        #pollev-watcher-settings .pw-favorite-list { display: grid; gap: 8px; margin-top: 12px; }
        #pollev-watcher-settings .pw-favorite-item {
          display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 7px;
          padding: 10px 11px; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff;
        }
        #pollev-watcher-settings .pw-favorite-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #pollev-watcher-settings .pw-small { padding: 6px 9px; font-size: 12px; }
        #pollev-watcher-settings .pw-status {
          min-height: 42px; padding: 12px 24px; border-top: 1px solid #e5e7eb;
          color: #475569; background: #fff; font-size: 12px;
        }
        @media (max-width: 680px) {
          #pollev-watcher-settings { padding: 8px; }
          #pollev-watcher-settings .pw-shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); height: calc(100vh - 16px); }
          #pollev-watcher-settings .pw-sidebar { padding: 12px; }
          #pollev-watcher-settings .pw-brand, #pollev-watcher-settings .pw-sidebar-note { display: none; }
          #pollev-watcher-settings .pw-nav { grid-template-columns: repeat(4, 1fr); }
          #pollev-watcher-settings .pw-nav-button { padding: 8px 5px; text-align: center; font-size: 12px; }
          #pollev-watcher-settings .pw-header { min-height: 58px; padding: 0 16px; }
          #pollev-watcher-settings .pw-content { padding: 16px; }
          #pollev-watcher-settings .pw-form-grid, #pollev-watcher-settings .pw-location-grid { grid-template-columns: 1fr; }
          #pollev-watcher-settings .pw-map { height: 240px; }
        }
      </style>
      <div class="pw-shell" role="dialog" aria-modal="true" aria-labelledby="pw-settings-title">
        <aside class="pw-sidebar">
          <div class="pw-brand">PollEv Watcher<small>控制中心</small></div>
          <nav class="pw-nav" aria-label="设置分类">
            <button class="pw-nav-button" data-section="overview">⌂ 概览</button>
            <button class="pw-nav-button" data-section="notifications">🔔 通知</button>
            <button class="pw-nav-button" data-section="location">📍 定位</button>
            <button class="pw-nav-button" data-section="favorites">★ 收藏地点</button>
          </nav>
          <div class="pw-sidebar-note">配置保存在 Tampermonkey 本地存储中</div>
        </aside>
        <main class="pw-main">
          <header class="pw-header"><h2 id="pw-settings-title">概览</h2><button class="pw-close" aria-label="关闭">×</button></header>
          <div class="pw-content">
            <section class="pw-panel" data-panel="overview">
              <h3 class="pw-section-title">快速控制</h3><p class="pw-section-note">常用功能可以在这里或 Tampermonkey 菜单中切换。</p>
              <div class="pw-card pw-row"><div><div class="pw-label">Poll 状态监测</div><div class="pw-note">检测等待、开启和题目切换</div></div><label class="pw-switch"><input id="pw-watch-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
              <div class="pw-card pw-row"><div><div class="pw-label">发送通知</div><div class="pw-note" id="pw-notification-summary">Telegram、桌面通知、声音和标题闪烁</div></div><label class="pw-switch"><input class="pw-notification-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
              <div class="pw-card pw-row"><div><div class="pw-label">定位模拟</div><div class="pw-note" id="pw-location-summary">仅作用于 Poll Everywhere 页面</div></div><label class="pw-switch"><input class="pw-location-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
            </section>
            <section class="pw-panel" data-panel="notifications">
              <div class="pw-row"><div><h3 class="pw-section-title">通知设置</h3><p class="pw-section-note">Bot Token 和 Chat ID 仅保存在 Tampermonkey 中。</p></div><span class="pw-badge" id="pw-telegram-badge"></span></div>
              <div class="pw-card">
                <div class="pw-row"><div><div class="pw-label">发送通知</div><div class="pw-note">关闭后仍继续监测，但不会发送任何提醒</div></div><label class="pw-switch"><input class="pw-notification-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
              </div>
              <div class="pw-card">
                <div class="pw-form-grid">
                  <div class="pw-field"><label for="pw-bot-token">Telegram Bot Token</label><input id="pw-bot-token" type="password" autocomplete="off"></div>
                  <div class="pw-field"><label for="pw-chat-id">Chat ID</label><input id="pw-chat-id" type="text" inputmode="numeric" placeholder="发送 /start 后可自动检测"></div>
                </div>
                <div class="pw-actions"><button class="pw-button pw-primary" id="pw-save-telegram">保存配置</button><button class="pw-button" id="pw-detect-chat">自动检测 Chat ID</button><button class="pw-button" id="pw-test-telegram">发送测试通知</button><button class="pw-button pw-danger" id="pw-delete-telegram">删除配置</button></div>
              </div>
            </section>
            <section class="pw-panel" data-panel="location">
              <div class="pw-row"><div><h3 class="pw-section-title">定位模拟</h3><p class="pw-section-note">点击地图或拖动标记选择位置；保存后刷新页面生效。</p></div><span class="pw-badge" id="pw-location-badge"></span></div>
              <div class="pw-card pw-row"><div><div class="pw-label">启用定位模拟</div><div class="pw-note">未保存有效坐标前不可开启</div></div><label class="pw-switch"><input class="pw-location-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
              <div class="pw-map-label">地图选点</div><div class="pw-map" id="pw-location-map"></div>
              <div class="pw-location-grid">
                <div class="pw-field"><label for="pw-latitude">Latitude</label><input id="pw-latitude" type="number" min="-90" max="90" step="any"></div>
                <div class="pw-field"><label for="pw-longitude">Longitude</label><input id="pw-longitude" type="number" min="-180" max="180" step="any"></div>
                <div class="pw-field"><label for="pw-accuracy">Accuracy (m)</label><input id="pw-accuracy" type="number" min="0.1" step="any"></div>
              </div>
              <div class="pw-field" style="margin-top:10px"><label for="pw-error-mode">定位结果</label><select id="pw-error-mode"><option value="0">成功</option><option value="1">权限被拒绝</option><option value="2">位置不可用</option><option value="3">请求超时</option></select></div>
              <div class="pw-actions"><button class="pw-button pw-primary" id="pw-save-location">保存定位设置</button><button class="pw-button" id="pw-test-location">运行自检</button></div>
            </section>
            <section class="pw-panel" data-panel="favorites">
              <h3 class="pw-section-title">收藏地点</h3><p class="pw-section-note">收藏后会出现在 Tampermonkey 菜单中，可一键切换并开启定位。</p>
              <div class="pw-card"><div class="pw-favorite-compose"><input id="pw-favorite-name" type="text" maxlength="40" placeholder="地点名称，例如 UCI 校园"><button class="pw-button pw-primary" id="pw-add-favorite">收藏当前坐标</button></div></div>
              <div class="pw-favorite-list" id="pw-favorite-list"></div>
            </section>
          </div>
          <div class="pw-status" id="pw-settings-status" aria-live="polite">设置会立即保存在当前浏览器中。</div>
        </main>
      </div>`;

    const titles = { overview: '概览', notifications: '通知', location: '定位', favorites: '收藏地点' };
    const watchToggle = overlay.querySelector('#pw-watch-toggle');
    const notificationToggles = [...overlay.querySelectorAll('.pw-notification-toggle')];
    const locationToggles = [...overlay.querySelectorAll('.pw-location-toggle')];
    const tokenInput = overlay.querySelector('#pw-bot-token');
    const chatIdInput = overlay.querySelector('#pw-chat-id');
    const latitude = overlay.querySelector('#pw-latitude');
    const longitude = overlay.querySelector('#pw-longitude');
    const accuracy = overlay.querySelector('#pw-accuracy');
    const errorMode = overlay.querySelector('#pw-error-mode');
    const favoriteName = overlay.querySelector('#pw-favorite-name');
    const favoriteList = overlay.querySelector('#pw-favorite-list');
    const status = overlay.querySelector('#pw-settings-status');
    let map = null;
    let marker = null;

    const setStatus = (message) => { status.textContent = message; };
    const setAllChecked = (toggles, checked) => toggles.forEach((toggle) => { toggle.checked = checked; });
    const refreshConfigurationUi = () => {
      const telegramConfigured = isTelegramConfigured();
      const locationConfigured = isLocationConfigured();
      const telegramBadge = overlay.querySelector('#pw-telegram-badge');
      const locationBadge = overlay.querySelector('#pw-location-badge');
      telegramBadge.textContent = telegramConfigured ? '已配置' : '未配置';
      telegramBadge.classList.toggle('is-unconfigured', !telegramConfigured);
      locationBadge.textContent = locationConfigured ? '已配置' : '未配置';
      locationBadge.classList.toggle('is-unconfigured', !locationConfigured);
      overlay.querySelector('#pw-notification-summary').textContent = telegramConfigured ? 'Telegram、桌面通知、声音和标题闪烁' : '尚未配置 Telegram；请前往“通知”设置';
      overlay.querySelector('#pw-location-summary').textContent = locationConfigured ? '仅作用于 Poll Everywhere 页面' : '尚未保存定位设置';
      notificationToggles.forEach((toggle) => { toggle.disabled = !telegramConfigured; });
      locationToggles.forEach((toggle) => { toggle.disabled = !locationConfigured; });
      setAllChecked(notificationToggles, telegramConfigured && Boolean(GM_getValue(STORAGE_KEYS.notificationsEnabled, true)));
      setAllChecked(locationToggles, locationConfigured && isLocationMockEnabled());
      tokenInput.placeholder = telegramConfigured ? '已保存；留空保持不变' : '从 @BotFather 复制完整 Token';
      chatIdInput.value = String(GM_getValue(STORAGE_KEYS.chatId, ''));
    };

    const setFormPosition = (position, message = '') => {
      latitude.value = Number(position.latitude).toFixed(6);
      longitude.value = Number(position.longitude).toFixed(6);
      if (map && marker) {
        const latLng = [Number(position.latitude), Number(position.longitude)];
        marker.setLatLng(latLng);
        map.setView(latLng, Math.max(map.getZoom(), 15));
      }
      if (message) setStatus(message);
    };

    const ensureMap = () => {
      if (map) {
        window.setTimeout(() => map.invalidateSize(), 0);
        return;
      }
      const leaflet = typeof L === 'undefined' ? null : L;
      if (!leaflet) {
        setStatus('地图组件加载失败，仍可手动输入坐标。');
        return;
      }
      const initialPosition = [Number(latitude.value), Number(longitude.value)];
      map = leaflet.map(overlay.querySelector('#pw-location-map')).setView(initialPosition, 15);
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      marker = leaflet.marker(initialPosition, {
        draggable: true,
        autoPan: true,
        title: '拖动选择位置',
        icon: leaflet.divIcon({ className: 'pw-map-pin', iconSize: [26, 36], iconAnchor: [13, 34] }),
      }).addTo(map);
      map.on('click', (event) => setFormPosition({ latitude: event.latlng.lat, longitude: event.latlng.lng }, '地图位置已选择；保存后生效。'));
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        setFormPosition({ latitude: position.lat, longitude: position.lng }, '标记位置已更新；保存后生效。');
      });
      window.setTimeout(() => map.invalidateSize(), 0);
    };

    const showSection = (section) => {
      const target = titles[section] ? section : 'overview';
      overlay.querySelectorAll('.pw-nav-button').forEach((button) => button.classList.toggle('is-active', button.dataset.section === target));
      overlay.querySelectorAll('.pw-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === target));
      overlay.querySelector('#pw-settings-title').textContent = titles[target];
      if (target === 'location') ensureMap();
    };

    watchToggle.checked = Boolean(GM_getValue(STORAGE_KEYS.enabled, true));
    latitude.value = String(locationSetting('latitude'));
    longitude.value = String(locationSetting('longitude'));
    accuracy.value = String(locationSetting('accuracy'));
    errorMode.value = String(locationSetting('errorCode'));
    refreshConfigurationUi();
    (document.body || document.documentElement).appendChild(overlay);

    const closePanel = () => {
      map?.remove();
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', onKeyDown);
    overlay.querySelector('.pw-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closePanel(); });
    overlay.querySelectorAll('.pw-nav-button').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.section)));

    watchToggle.addEventListener('change', () => {
      GM_setValue(STORAGE_KEYS.enabled, watchToggle.checked);
      evaluateState();
      refreshControlMenus();
      setStatus(`状态监测已${watchToggle.checked ? '开启' : '暂停'}。`);
    });
    notificationToggles.forEach((toggle) => toggle.addEventListener('change', () => {
      GM_setValue(STORAGE_KEYS.notificationsEnabled, toggle.checked);
      setAllChecked(notificationToggles, toggle.checked);
      refreshControlMenus();
      setStatus(`通知已${toggle.checked ? '开启' : '关闭'}。`);
    }));
    locationToggles.forEach((toggle) => toggle.addEventListener('change', () => {
      GM_setValue(STORAGE_KEYS.locationEnabled, toggle.checked);
      setAllChecked(locationToggles, toggle.checked);
      updateLocationBadge();
      refreshControlMenus();
      setStatus(`定位模拟已${toggle.checked ? '开启' : '关闭'}。请刷新页面后重新检查定位。`);
    }));

    overlay.querySelector('#pw-save-telegram').addEventListener('click', () => {
      const currentToken = String(GM_getValue(STORAGE_KEYS.botToken, '')).trim();
      const nextToken = tokenInput.value.trim() || currentToken;
      const nextChatId = chatIdInput.value.trim();
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(nextToken)) {
        setStatus('Token 格式不正确，请从 @BotFather 复制完整 Token。');
        return;
      }
      if (!/^-?\d+$/.test(nextChatId)) {
        setStatus('Chat ID 应为一串数字；可先给机器人发送 /start，再自动检测。');
        return;
      }
      GM_setValue(STORAGE_KEYS.botToken, nextToken);
      GM_setValue(STORAGE_KEYS.chatId, nextChatId);
      tokenInput.value = '';
      refreshConfigurationUi();
      refreshControlMenus();
      setStatus('Telegram 配置已保存。');
    });
    overlay.querySelector('#pw-detect-chat').addEventListener('click', async () => {
      const candidateToken = tokenInput.value.trim() || String(GM_getValue(STORAGE_KEYS.botToken, '')).trim();
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(candidateToken)) {
        setStatus('请先输入有效的 Bot Token。');
        return;
      }
      setStatus('正在检测最近的 Telegram 对话…');
      try {
        const chat = await detectLatestTelegramChat(candidateToken);
        if (!chat?.id) {
          setStatus('没有检测到对话。请先给机器人发送 /start，然后重试。');
          return;
        }
        chatIdInput.value = String(chat.id);
        const detectedName = normalizeText([chat.first_name, chat.last_name, chat.title].filter(Boolean).join(' '));
        setStatus(`已检测到 Chat ID${detectedName ? `（${detectedName}）` : ''}；请点击“保存配置”。`);
      } catch (error) {
        setStatus(`检测失败：${error.message}`);
      }
    });
    overlay.querySelector('#pw-test-telegram').addEventListener('click', async () => {
      if (!isTelegramConfigured()) {
        setStatus('请先保存 Telegram 配置。');
        return;
      }
      setStatus('正在发送测试通知…');
      try {
        await sendTelegramMessage(`✅ PollEv Watcher 测试成功\n${location.href}`);
        setStatus('Telegram 测试通知已发送。');
      } catch (error) {
        setStatus(`发送失败：${error.message}`);
      }
    });
    overlay.querySelector('#pw-delete-telegram').addEventListener('click', () => {
      if (!window.confirm('确定删除保存在 Tampermonkey 中的 Bot Token 和 Chat ID 吗？')) return;
      GM_deleteValue(STORAGE_KEYS.botToken);
      GM_deleteValue(STORAGE_KEYS.chatId);
      tokenInput.value = '';
      refreshConfigurationUi();
      refreshControlMenus();
      setStatus('Telegram 配置已删除。');
    });

    overlay.querySelector('#pw-save-location').addEventListener('click', () => {
      const values = { latitude: Number(latitude.value), longitude: Number(longitude.value), accuracy: Number(accuracy.value), errorCode: Number(errorMode.value) };
      if (!Number.isFinite(values.latitude) || values.latitude < -90 || values.latitude > 90
        || !Number.isFinite(values.longitude) || values.longitude < -180 || values.longitude > 180
        || !Number.isFinite(values.accuracy) || values.accuracy <= 0 || ![0, 1, 2, 3].includes(values.errorCode)) {
        setStatus('坐标、精度或错误模式格式不正确。');
        return;
      }
      GM_setValue(STORAGE_KEYS.latitude, values.latitude);
      GM_setValue(STORAGE_KEYS.longitude, values.longitude);
      GM_setValue(STORAGE_KEYS.accuracy, values.accuracy);
      GM_setValue(STORAGE_KEYS.locationErrorCode, values.errorCode);
      GM_setValue(STORAGE_KEYS.locationConfigured, true);
      refreshConfigurationUi();
      updateLocationBadge();
      refreshControlMenus();
      setStatus('定位设置已保存。现在可以开启定位模拟；开启后请刷新页面。');
    });
    overlay.querySelector('#pw-test-location').addEventListener('click', testLocationMock);

    function renderSavedLocations() {
      favoriteList.replaceChildren();
      const locations = savedLocations();
      if (!locations.length) {
        const empty = document.createElement('div');
        empty.className = 'pw-card pw-note';
        empty.textContent = '还没有收藏地点。请先在“定位”中选好坐标，再返回这里收藏。';
        favoriteList.appendChild(empty);
        return;
      }
      locations.forEach((savedLocation) => {
        const row = document.createElement('div');
        row.className = 'pw-favorite-item';
        const name = document.createElement('div');
        name.className = 'pw-favorite-name';
        name.textContent = savedLocation.name;
        name.title = `${savedLocation.latitude}, ${savedLocation.longitude}`;
        const useButton = document.createElement('button');
        useButton.className = 'pw-button pw-small';
        useButton.textContent = '使用';
        useButton.addEventListener('click', () => {
          activateSavedLocation(savedLocation);
          errorMode.value = '0';
          accuracy.value = String(savedLocation.accuracy);
          setFormPosition(savedLocation);
          refreshConfigurationUi();
          setStatus(`已切换到“${savedLocation.name}”并开启定位；请刷新页面。`);
        });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'pw-button pw-small pw-danger';
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => {
          if (!window.confirm(`删除收藏地点“${savedLocation.name}”吗？`)) return;
          storeSavedLocations(savedLocations().filter(({ id }) => id !== savedLocation.id));
          refreshControlMenus();
          renderSavedLocations();
          setStatus(`已删除“${savedLocation.name}”。`);
        });
        row.append(name, useButton, deleteButton);
        favoriteList.appendChild(row);
      });
    }

    overlay.querySelector('#pw-add-favorite').addEventListener('click', () => {
      const name = favoriteName.value.trim();
      const nextLocation = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        latitude: Number(latitude.value),
        longitude: Number(longitude.value),
        accuracy: Number(accuracy.value),
      };
      if (!name) {
        setStatus('请先输入收藏地点名称。');
        return;
      }
      if (!Number.isFinite(nextLocation.latitude) || nextLocation.latitude < -90 || nextLocation.latitude > 90
        || !Number.isFinite(nextLocation.longitude) || nextLocation.longitude < -180 || nextLocation.longitude > 180
        || !Number.isFinite(nextLocation.accuracy) || nextLocation.accuracy <= 0) {
        setStatus('当前坐标或精度格式不正确，无法收藏。');
        return;
      }
      const locations = savedLocations();
      const duplicateIndex = locations.findIndex((savedLocation) => savedLocation.name.toLowerCase() === name.toLowerCase());
      if (duplicateIndex >= 0) {
        nextLocation.id = locations[duplicateIndex].id;
        locations.splice(duplicateIndex, 1, nextLocation);
      } else {
        locations.push(nextLocation);
      }
      storeSavedLocations(locations);
      favoriteName.value = '';
      refreshControlMenus();
      renderSavedLocations();
      setStatus(duplicateIndex >= 0 ? `已更新收藏地点“${name}”。` : `已收藏“${name}”。`);
    });

    renderSavedLocations();
    showSection(initialSection);
  }

  refreshControlMenus();

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
