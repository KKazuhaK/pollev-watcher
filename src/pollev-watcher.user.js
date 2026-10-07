// ==UserScript==
// @name         PollEv Watcher
// @author       KKazuhaK
// @namespace    https://github.com/pollev-watcher
// @version      0.8.1
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
// @connect      photon.komoot.io
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

  const LANGUAGE_KEY = 'interfaceLanguage';
  const EN_MESSAGES = Object.freeze({
    "已开启": "On",
    "已关闭": "Off",
    "未配置": "Not configured",
    "已配置": "Configured",
    "监测": "Monitoring",
    "定位": "Location",
    "通知": "Notifications",
    "开启": "enabled",
    "关闭": "disabled",
    "关闭窗口": "Close",
    "暂停": "paused",
    "🎛️ 打开 Watcher 设置": "🎛️ Open Watcher settings",
    "控制中心": "Control center",
    "设置分类": "Settings sections",
    "概览": "Overview",
    "收藏地点": "Saved places",
    "快速控制": "Quick controls",
    "常用功能可以在这里或 Tampermonkey 菜单中切换。": "Use these controls here or in the Tampermonkey menu.",
    "配置保存在 Tampermonkey 本地存储中": "Settings are stored locally in Tampermonkey",
    "Poll 状态监测": "Poll monitoring",
    "检测等待、开启和题目切换": "Detect waiting, activation, and question changes",
    "发送通知": "Send notifications",
    "Telegram、桌面通知、声音和标题闪烁": "Telegram, desktop alerts, sound, and tab flashing",
    "定位模拟": "Location simulation",
    "仅作用于 Poll Everywhere 页面": "Only applies to Poll Everywhere pages",
    "通知设置": "Notification settings",
    "Bot Token 和 Chat ID 仅保存在 Tampermonkey 中。": "Bot Token and Chat ID are stored only in Tampermonkey.",
    "关闭后仍继续监测，但不会发送任何提醒": "Monitoring continues when off, but no alerts are sent",
    "发送 /start 后可自动检测": "Send /start to enable auto-detection",
    "保存配置": "Save configuration",
    "自动检测 Chat ID": "Detect Chat ID",
    "发送测试通知": "Send test notification",
    "删除配置": "Delete configuration",
    "点击地图或拖动标记选择位置；保存后刷新页面生效。": "Click the map or drag the marker; save and refresh the page to apply.",
    "启用定位模拟": "Enable location simulation",
    "未保存有效坐标前不可开启": "Save valid coordinates before enabling",
    "地图选点": "Choose a location",
    "搜索地点或地址": "Search for a place or address",
    "搜索": "Search",
    "搜索中…": "Searching…",
    "地点搜索结果": "Place search results",
    "点击搜索才会将搜索词发送给 ": "Pressing Search sends your query to ",
    "；请勿输入敏感信息。数据 © ": "; do not enter sensitive information. Data © ",
    "定位结果": "Location result",
    "成功": "Success",
    "权限被拒绝": "Permission denied",
    "位置不可用": "Position unavailable",
    "请求超时": "Request timed out",
    "保存定位设置": "Save location settings",
    "运行自检": "Run self-test",
    "收藏后会出现在 Tampermonkey 菜单中，可一键切换并开启定位。": "Saved places appear in the Tampermonkey menu for one-click switching and enabling.",
    "地点名称": "Place name",
    "收藏当前坐标": "Save current coordinates",
    "偏好设置自动保存；坐标修改需点击保存。": "Preferences are saved in this browser; coordinate changes require Save.",
    "尚未配置 Telegram；请前往“通知”设置": "Telegram is not configured; open Notifications",
    "尚未保存定位设置": "No location settings saved",
    "已保存；留空保持不变": "Saved; leave blank to keep unchanged",
    "从 @BotFather 复制完整 Token": "Copy the full token from @BotFather",
    "地图组件加载失败，仍可手动输入坐标。": "The map failed to load. You can still enter coordinates manually.",
    "拖动选择位置": "Drag to choose a location",
    "地图位置已选择；保存后生效。": "Map location selected; save to apply.",
    "标记位置已更新；保存后生效。": "Marker updated; save to apply.",
    "正在搜索地点…": "Searching for places…",
    "选择一个结果，或继续在地图上调整；保存后生效。": "Choose a result or adjust the map; save to apply.",
    "没有找到地点，请补充城市或尝试其他名称，也可以直接在地图选点。": "No places found. Add a city, try another name, or click the map.",
    "未命名地点": "Unnamed place",
    "搜索服务返回了无效数据，请稍后重试。": "The search service returned invalid data. Please try again later.",
    "请输入至少两个字符的地点名称或地址。": "Enter at least two characters of a place name or address.",
    "搜索内容过长，请缩短后重试。": "The query is too long. Please shorten it.",
    "正在搜索，请等待当前搜索完成。": "A search is in progress. Please wait.",
    "搜索过于频繁，请稍等再试。": "Please wait a moment before searching again.",
    "搜索已取消。": "Search cancelled.",
    "搜索服务暂时限流，请稍后重试。": "The search service is rate-limiting requests. Please try later.",
    "搜索服务暂不可用，请稍后重试或手动选点。": "The search service is unavailable. Try later or select a point manually.",
    "无法连接搜索服务，请检查网络或 Tampermonkey 的域名访问权限。": "Cannot connect to search. Check your network or Tampermonkey domain permissions.",
    "搜索超时，请重试或手动选点。": "Search timed out. Try again or select a point manually.",
    "无法发起搜索，请检查 Tampermonkey 的域名访问权限。": "Cannot start search. Check Tampermonkey domain permissions.",
    "已选择“{name}”；请保存定位设置后生效。": "Selected “{name}”; save location settings to apply.",
    "已选择：{name}。可以拖动标记微调。": "Selected: {name}. Drag the marker to fine-tune.",
    "状态监测已{state}。": "Monitoring {state}.",
    "通知已{state}。": "Notifications {state}.",
    "定位模拟已{state}。请刷新页面后重新检查定位。": "Location simulation {state}. Refresh the page before checking location again.",
    "Token 格式不正确，请从 @BotFather 复制完整 Token。": "Invalid token format. Copy the full token from @BotFather.",
    "Chat ID 应为一串数字；可先给机器人发送 /start，再自动检测。": "Chat ID must be numeric. Send /start to the bot, then use auto-detection.",
    "Telegram 配置已保存。": "Telegram configuration saved.",
    "请先输入有效的 Bot Token。": "Enter a valid Bot Token first.",
    "正在检测最近的 Telegram 对话…": "Detecting recent Telegram chats…",
    "没有检测到对话。请先给机器人发送 /start，然后重试。": "No chats found. Send /start to the bot, then try again.",
    "已检测到 Chat ID{name}；请点击“保存配置”。": "Detected Chat ID{name}; click Save configuration.",
    "检测失败：{error}": "Detection failed: {error}",
    "请先保存 Telegram 配置。": "Save your Telegram configuration first.",
    "正在发送测试通知…": "Sending test notification…",
    "✅ PollEv Watcher 测试成功": "✅ PollEv Watcher test successful",
    "Telegram 测试通知已发送。": "Telegram test notification sent.",
    "发送失败：{error}": "Send failed: {error}",
    "确定删除保存在 Tampermonkey 中的 Bot Token 和 Chat ID 吗？": "Delete the Bot Token and Chat ID stored in Tampermonkey?",
    "Telegram 配置已删除。": "Telegram configuration deleted.",
    "坐标、精度或错误模式格式不正确。": "Invalid coordinates, accuracy, or error mode.",
    "定位设置已保存。现在可以开启定位模拟；开启后请刷新页面。": "Location settings saved. You can enable simulation now; refresh the page after enabling.",
    "还没有收藏地点。请先在“定位”中选好坐标，再返回这里收藏。": "No saved places yet. Choose coordinates in Location, then return here to save them.",
    "使用": "Use",
    "删除": "Delete",
    "已切换到“{name}”并开启定位；请刷新页面。": "Switched to “{name}” and enabled location simulation; refresh the page.",
    "删除收藏地点“{name}”吗？": "Delete saved place “{name}”?",
    "已删除“{name}”。": "Deleted “{name}”.",
    "请先输入收藏地点名称。": "Enter a place name first.",
    "当前坐标或精度格式不正确，无法收藏。": "Cannot save: invalid coordinates or accuracy.",
    "已更新收藏地点“{name}”。": "Updated saved place “{name}”.",
    "已收藏“{name}”。": "Saved “{name}”.",
    "🔔 Poll Everywhere 新题已开启": "🔔 A new Poll Everywhere question is active",
    "🔔 Poll Everywhere 已开启": "🔔 Poll Everywhere is active",
    "Poll Everywhere 新题已开启": "A new Poll Everywhere question is active",
    "Poll Everywhere 已开启": "Poll Everywhere is active",
    "活动现在可以作答了。": "The activity is now open for responses.",
    "Telegram 通知发送失败": "Telegram notification failed",
    "页面：{title}": "Page: {title}",
    "链接：{url}": "Link: {url}",
    "当前浏览器没有提供 Geolocation API。": "This browser does not provide the Geolocation API.",
    "纬度": "Latitude",
    "经度": "Longitude",
    "精度（米）": "Accuracy (m)",
    "定位错误 {code}：{error}": "Geolocation error {code}: {error}",
    "定位模拟：错误 {code}": "Location simulation: error {code}",
    "定位模拟：{latitude}, {longitude}": "Location simulation: {latitude}, {longitude}",
    "PollEv Watcher：等待开启": "PollEv Watcher: waiting",
    "PollEv Watcher：活动开启": "PollEv Watcher: active",
    "PollEv Watcher：监测中": "PollEv Watcher: watching",
    "PollEv Watcher：监测已暂停": "PollEv Watcher: paused",
    "PollEv Watcher：Telegram 发送失败": "PollEv Watcher: Telegram failed",
    "🔔 活动已开启！": "🔔 Poll is active!",
    "未配置 Telegram Bot Token。": "Telegram Bot Token is not configured.",
    "未配置 Telegram Chat ID。": "Telegram Chat ID is not configured.",
    "Telegram 请求超时。": "Telegram request timed out.",
    "无法连接 Telegram。": "Could not connect to Telegram.",
    "Telegram 返回 HTTP {status}。": "Telegram returned HTTP {status}.",
    "语言": "Language",
    "跟随浏览器": "Follow browser",
    "界面和通知语言": "Interface and notification language",
    "放大": "Zoom in",
    "缩小": "Zoom out",
    "用户拒绝定位权限": "User denied Geolocation",
    "定位不可用": "Position unavailable",
    "定位请求超时": "Geolocation request timed out",
    "未知定位错误": "Unknown geolocation error"
  });

  function languagePreference() {
    const preference = GM_getValue(LANGUAGE_KEY, 'auto');
    return ['auto', 'zh', 'en'].includes(preference) ? preference : 'auto';
  }

  function currentLanguage() {
    const preference = languagePreference();
    if (preference !== 'auto') return preference;
    const language = window.navigator?.languages?.[0] || window.navigator?.language || 'zh';
    return language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function t(message, parameters = {}) {
    const translated = currentLanguage() === 'en' ? (EN_MESSAGES[message] || message) : message;
    return translated.replace(/\{(\w+)\}/g, (match, key) => String(parameters[key] ?? match));
  }

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
    /pre-registration required/i,
    /please log in to the poll everywhere account/i,
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
  const placeSearch = createPlaceSearchClient();

  function normalizePlaceResults(data) {
    if (!Array.isArray(data?.features)) throw new Error(t('搜索服务返回了无效数据，请稍后重试。'));
    return data.features.flatMap((feature) => {
      const coordinates = feature?.geometry?.coordinates;
      if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return [];
      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return [];
      const properties = feature.properties || {};
      const address = [...new Set([
        [properties.housenumber, properties.street].filter(Boolean).join(' '),
        properties.city, properties.state, properties.country,
      ].filter((part) => typeof part === 'string' && part.trim()))].join(', ');
      return [{ latitude, longitude, name: String(properties.name || properties.street || properties.city || t('未命名地点')), address }];
    }).slice(0, 5);
  }

  function createPlaceSearchClient() {
    const cache = new Map();
    let lastRequestAt = -Infinity;
    let pending = null;
    return {
      search(value) {
        const query = value.trim().replace(/\s+/g, ' ');
        if (query.length < 2) return Promise.reject(new Error(t('请输入至少两个字符的地点名称或地址。')));
        if (query.length > 200) return Promise.reject(new Error(t('搜索内容过长，请缩短后重试。')));
        const key = query.toLowerCase();
        if (cache.has(key)) return Promise.resolve(cache.get(key));
        if (pending) return Promise.reject(new Error(t('正在搜索，请等待当前搜索完成。')));
        if (Date.now() - lastRequestAt < 1200) return Promise.reject(new Error(t('搜索过于频繁，请稍等再试。')));
        lastRequestAt = Date.now();
        return new Promise((resolve, reject) => {
          const operation = { request: null, cancel: null };
          pending = operation;
          const finish = (error, results) => {
            if (pending !== operation) return;
            pending = null;
            if (error) reject(error);
            else {
              cache.set(key, results);
              if (cache.size > 20) cache.delete(cache.keys().next().value);
              resolve(results);
            }
          };
          operation.cancel = () => {
            finish(new Error(t('搜索已取消。')));
            operation.request?.abort();
          };
          try {
            operation.request = GM_xmlhttpRequest({
              method: 'GET',
              url: `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
              headers: { Accept: 'application/json' },
              anonymous: true,
              timeout: 15_000,
              onload: (response) => {
                if (response.status === 429) {
                  finish(new Error(t('搜索服务暂时限流，请稍后重试。')));
                  return;
                }
                if (response.status < 200 || response.status >= 300) {
                  finish(new Error(t('搜索服务暂不可用，请稍后重试或手动选点。')));
                  return;
                }
                try { finish(null, normalizePlaceResults(JSON.parse(response.responseText))); }
                catch { finish(new Error(t('搜索服务返回了无效数据，请稍后重试。'))); }
              },
              onerror: () => finish(new Error(t('无法连接搜索服务，请检查网络或 Tampermonkey 的域名访问权限。'))),
              ontimeout: () => finish(new Error(t('搜索超时，请重试或手动选点。'))),
              onabort: () => finish(new Error(t('搜索已取消。'))),
            });
          } catch { finish(new Error(t('无法发起搜索，请检查 Tampermonkey 的域名访问权限。'))); }
        });
      },
      cancel() { pending?.cancel(); },
    };
  }

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
    return `⏯️ ${t('监测')} [${enabled ? t('已开启') : t('已关闭')}]`;
  }

  function locationToggleMenuLabel() {
    if (!isLocationConfigured()) return `📍 ${t('定位')} [${t('未配置')}]`;
    const enabled = isLocationMockEnabled();
    return `📍 ${t('定位')} [${enabled ? t('已开启') : t('已关闭')}]`;
  }

  function notificationToggleMenuLabel() {
    if (!isTelegramConfigured()) return `🔔 ${t('通知')} [${t('未配置')}]`;
    const enabled = Boolean(GM_getValue(STORAGE_KEYS.notificationsEnabled, true));
    return `🔔 ${t('通知')} [${enabled ? t('已开启') : t('已关闭')}]`;
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
      t('🎛️ 打开 Watcher 设置'),
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
      1: t('用户拒绝定位权限'),
      2: t('定位不可用'),
      3: t('定位请求超时'),
    };
    return {
      code,
      message: messages[code] || t('未知定位错误'),
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

    if (hasActivityControl || activityFingerprint() || (waitingWasObserved && text.length > 0)) {
      return STATES.active;
    }

    return STATES.unknown;
  }

  function activityFingerprint() {
    const headingText = [
      '.component-response-header__title',
      'main h1',
      'main h2',
      '[role="main"] h1',
      '[role="main"] h2',
      '[data-testid*="question"]',
      '[class*="question"] h1',
      '[class*="question"] h2',
      'h1',
      'h2',
      '[role="heading"]',
    ].map((selector) => document.querySelector(selector))
      .filter((element) => element && !element.closest?.('[id^="pollev-watcher"], [id^="pollev-location"]'))
      .map((element) => normalizeText(element.innerText || element.textContent))
      .find(Boolean);
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
      [STATES.waiting]: t('PollEv Watcher：等待开启'),
      [STATES.active]: t('PollEv Watcher：活动开启'),
      [STATES.unknown]: t('PollEv Watcher：监测中'),
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
      document.title = showAlert ? t('🔔 活动已开启！') : originalTitle;
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
    if (!token) return Promise.reject(new Error(t('未配置 Telegram Bot Token。')));

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
            reject(new Error(t('Telegram 返回 HTTP {status}。', { status: response.status })));
            return;
          }

          if (response.status >= 200 && response.status < 300 && result.ok) {
            resolve(result.result);
          } else {
            reject(new Error(result.description || t('Telegram 返回 HTTP {status}。', { status: response.status })));
          }
        },
        ontimeout: () => reject(new Error(t('Telegram 请求超时。'))),
        onerror: () => reject(new Error(t('无法连接 Telegram。'))),
      });
    });
  }

  async function sendTelegramMessage(text) {
    const chatId = String(GM_getValue(STORAGE_KEYS.chatId, '')).trim();
    if (!chatId) throw new Error(t('未配置 Telegram Chat ID。'));

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
      isNextQuestion ? t('🔔 Poll Everywhere 新题已开启') : t('🔔 Poll Everywhere 已开启'),
      document.title ? t('页面：{title}', { title: document.title }) : '',
      t('链接：{url}', { url: location.href }),
    ].filter(Boolean).join('\n');

    setBadge(STATES.active);
    if (!GM_getValue(STORAGE_KEYS.notificationsEnabled, true)) return;

    localNotification(
      isNextQuestion ? t('Poll Everywhere 新题已开启') : t('Poll Everywhere 已开启'),
      t('活动现在可以作答了。'),
    );
    playAlertSound();
    flashTitle();

    try {
      await sendTelegramMessage(message);
    } catch (error) {
      console.warn('[PollEv Watcher] Telegram notification failed:', error.message);
      localNotification(t('Telegram 通知发送失败'), error.message);
      setBadge(STATES.active, t('PollEv Watcher：Telegram 发送失败'));
    }
  }

  function evaluateState() {
    if (!GM_getValue(STORAGE_KEYS.enabled, true)) {
      setBadge(STATES.unknown, t('PollEv Watcher：监测已暂停'));
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
      // Joined mid-session: take the current question as the baseline so later changes still notify.
      if (state === STATES.active) lastActivityFingerprint = activityFingerprint();
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
      ? t('定位模拟：错误 {code}', { code: locationSetting('errorCode') })
      : t('定位模拟：{latitude}, {longitude}', { latitude: Number(locationSetting('latitude')).toFixed(4), longitude: Number(locationSetting('longitude')).toFixed(4) });
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
      window.alert(t('当前浏览器没有提供 Geolocation API。'));
      return;
    }
    pageWindow.navigator.geolocation.getCurrentPosition(
      (position) => window.alert([
        `${t('纬度')}: ${position.coords.latitude}`,
        `${t('经度')}: ${position.coords.longitude}`,
        `${t('精度（米）')}: ${position.coords.accuracy}`,
      ].join('\n')),
      (error) => window.alert(t('定位错误 {code}：{error}', { code: error.code, error: error.message })),
    );
  }

  function openSettingsPanel(initialSection = 'overview', draftValues = null) {
    document.getElementById('pollev-watcher-settings')?.remove();

    if (!leafletCssAdded) {
      GM_addStyle(GM_getResourceText('leafletCSS'));
      leafletCssAdded = true;
    }

    const overlay = document.createElement('div');
    overlay.id = 'pollev-watcher-settings';
    overlay.lang = currentLanguage() === 'zh' ? 'zh-CN' : 'en';
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
          grid-template-rows: minmax(0, 1fr);
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
        #pollev-watcher-settings .pw-main {
          display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
          min-width: 0; min-height: 0; overflow: hidden;
        }
        #pollev-watcher-settings .pw-header {
          display: flex; align-items: center; justify-content: space-between; min-height: 68px;
          padding: 0 24px; border-bottom: 1px solid #e5e7eb;
        }
        #pollev-watcher-settings .pw-header h2 { margin: 0; font-size: 20px; }
        #pollev-watcher-settings .pw-close {
          width: 34px; height: 34px; border: 0; border-radius: 9px; color: #64748b;
          background: #f1f5f9; cursor: pointer; font-size: 23px; line-height: 1;
        }
        #pollev-watcher-settings .pw-content {
          min-height: 0; overflow-y: auto; overscroll-behavior-y: contain;
          scrollbar-gutter: stable; padding: 22px 24px; background: #f8fafc;
        }
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
        #pollev-watcher-settings .pw-map-wrap { position: relative; isolation: isolate; }
        #pollev-watcher-settings .pw-map-search {
          position: absolute; top: 12px; left: 52px; right: 12px; z-index: 1001;
          display: flex; flex-direction: column; max-height: calc(100% - 24px);
        }
        #pollev-watcher-settings .pw-search-form {
          display: flex; flex-shrink: 0; gap: 6px; padding: 5px; border: 1px solid #cbd5e1; border-radius: 10px;
          background: #fff; box-shadow: 0 2px 10px rgba(15,23,42,.18);
        }
        #pollev-watcher-settings .pw-search-form input { min-width: 0; flex: 1; }
        #pollev-watcher-settings .pw-search-form button { flex-shrink: 0; }
        #pollev-watcher-settings .pw-search-results {
          display: grid; gap: 5px; min-height: 0; max-height: 150px; overflow-y: auto; overscroll-behavior: contain;
          margin-top: 5px; padding: 5px; border-radius: 9px; background: #fff; box-shadow: 0 2px 10px rgba(15,23,42,.18);
        }
        #pollev-watcher-settings .pw-search-results:empty, #pollev-watcher-settings .pw-search-note:empty { display: none; }
        #pollev-watcher-settings .pw-search-result {
          width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 9px;
          text-align: left; color: #172033; background: #fff; cursor: pointer; overflow-wrap: anywhere;
        }
        #pollev-watcher-settings .pw-search-result:hover, #pollev-watcher-settings .pw-search-result:focus-visible { border-color: #2563eb; background: #eff6ff; }
        #pollev-watcher-settings .pw-search-result strong, #pollev-watcher-settings .pw-search-result small { display: block; }
        #pollev-watcher-settings .pw-search-result small { margin-top: 3px; color: #64748b; }
        #pollev-watcher-settings .pw-search-note {
          flex-shrink: 0; margin-top: 5px; padding: 7px 9px; border-radius: 8px; color: #475569; background: #fff;
          box-shadow: 0 2px 10px rgba(15,23,42,.12); font-size: 12px;
        }
        #pollev-watcher-settings .pw-search-privacy { margin-top: 7px; }
        #pollev-watcher-settings .pw-map { z-index: 0; height: 300px; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 11px; background: #e2e8f0; }
        #pollev-watcher-settings .pw-map-pin { width: 26px !important; height: 36px !important; border: 0; background: transparent; }
        #pollev-watcher-settings .pw-map-pin::before {
          content: ""; display: block; box-sizing: border-box; width: 24px; height: 24px; border: 3px solid #fff;
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
          <div class="pw-brand">PollEv Watcher<small>${t('控制中心')}</small></div>
          <nav class="pw-nav" aria-label="${t('设置分类')}">
            <button class="pw-nav-button" data-section="overview">⌂ ${t('概览')}</button>
            <button class="pw-nav-button" data-section="notifications">🔔 ${t('通知')}</button>
            <button class="pw-nav-button" data-section="location">📍 ${t('定位')}</button>
            <button class="pw-nav-button" data-section="favorites">★ ${t('收藏地点')}</button>
          </nav>
          <div class="pw-sidebar-note">${t('配置保存在 Tampermonkey 本地存储中')}</div>
        </aside>
        <main class="pw-main">
          <header class="pw-header"><h2 id="pw-settings-title">${t('概览')}</h2><button class="pw-close" aria-label="${t('关闭窗口')}">×</button></header>
          <div class="pw-content">
            <section class="pw-panel" data-panel="overview">
              <h3 class="pw-section-title">${t('快速控制')}</h3><p class="pw-section-note">${t('常用功能可以在这里或 Tampermonkey 菜单中切换。')}</p>
              <div class="pw-card pw-field"><label for="pw-language">${t('界面和通知语言')}</label><select id="pw-language"><option value="auto">${t('跟随浏览器')}</option><option value="zh">简体中文</option><option value="en">English</option></select></div>
              <div class="pw-card pw-row"><div><div class="pw-label">${t('Poll 状态监测')}</div><div class="pw-note">${t('检测等待、开启和题目切换')}</div></div><label class="pw-switch"><input id="pw-watch-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
              <div class="pw-card pw-row"><div><div class="pw-label">${t('发送通知')}</div><div class="pw-note" id="pw-notification-summary">${t('Telegram、桌面通知、声音和标题闪烁')}</div></div><label class="pw-switch"><input class="pw-notification-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
              <div class="pw-card pw-row"><div><div class="pw-label">${t('定位模拟')}</div><div class="pw-note" id="pw-location-summary">${t('仅作用于 Poll Everywhere 页面')}</div></div><label class="pw-switch"><input class="pw-location-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
            </section>
            <section class="pw-panel" data-panel="notifications">
              <div class="pw-row"><div><h3 class="pw-section-title">${t('通知设置')}</h3><p class="pw-section-note">${t('Bot Token 和 Chat ID 仅保存在 Tampermonkey 中。')}</p></div><span class="pw-badge" id="pw-telegram-badge"></span></div>
              <div class="pw-card">
                <div class="pw-row"><div><div class="pw-label">${t('发送通知')}</div><div class="pw-note">${t('关闭后仍继续监测，但不会发送任何提醒')}</div></div><label class="pw-switch"><input class="pw-notification-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
              </div>
              <div class="pw-card">
                <div class="pw-form-grid">
                  <div class="pw-field"><label for="pw-bot-token">Telegram Bot Token</label><input id="pw-bot-token" type="password" autocomplete="off"></div>
                  <div class="pw-field"><label for="pw-chat-id">Chat ID</label><input id="pw-chat-id" type="text" inputmode="numeric" placeholder="${t('发送 /start 后可自动检测')}"></div>
                </div>
                <div class="pw-actions"><button class="pw-button pw-primary" id="pw-save-telegram">${t('保存配置')}</button><button class="pw-button" id="pw-detect-chat">${t('自动检测 Chat ID')}</button><button class="pw-button" id="pw-test-telegram">${t('发送测试通知')}</button><button class="pw-button pw-danger" id="pw-delete-telegram">${t('删除配置')}</button></div>
              </div>
            </section>
            <section class="pw-panel" data-panel="location">
              <div class="pw-row"><div><h3 class="pw-section-title">${t('定位模拟')}</h3><p class="pw-section-note">${t('点击地图或拖动标记选择位置；保存后刷新页面生效。')}</p></div><span class="pw-badge" id="pw-location-badge"></span></div>
              <div class="pw-card pw-row"><div><div class="pw-label">${t('启用定位模拟')}</div><div class="pw-note">${t('未保存有效坐标前不可开启')}</div></div><label class="pw-switch"><input class="pw-location-toggle" type="checkbox"><span class="pw-slider"></span></label></div>
              <div class="pw-map-label">${t('地图选点')}</div>
              <div class="pw-map-wrap">
                <div class="pw-map" id="pw-location-map"></div>
                <div class="pw-map-search">
                  <form class="pw-search-form" id="pw-place-search"><input id="pw-place-query" type="text" maxlength="200" autocomplete="off" aria-label="${t('搜索地点或地址')}" placeholder="${t('搜索地点或地址')}"><button class="pw-button pw-primary" id="pw-search-button" type="submit">${t('搜索')}</button></form>
                  <div class="pw-search-note" id="pw-search-note" role="status" aria-live="polite"></div>
                  <div class="pw-search-results" id="pw-search-results" aria-label="${t('地点搜索结果')}"></div>
                </div>
              </div>
              <div class="pw-note pw-search-privacy">${t('点击搜索才会将搜索词发送给 ')}<a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a>${t('；请勿输入敏感信息。数据 © ')}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>.</div>
              <div class="pw-location-grid">
                <div class="pw-field"><label for="pw-latitude">${t('纬度')}</label><input id="pw-latitude" type="number" min="-90" max="90" step="any"></div>
                <div class="pw-field"><label for="pw-longitude">${t('经度')}</label><input id="pw-longitude" type="number" min="-180" max="180" step="any"></div>
                <div class="pw-field"><label for="pw-accuracy">${t('精度（米）')}</label><input id="pw-accuracy" type="number" min="0.1" step="any"></div>
              </div>
              <div class="pw-field" style="margin-top:10px"><label for="pw-error-mode">${t('定位结果')}</label><select id="pw-error-mode"><option value="0">${t('成功')}</option><option value="1">${t('权限被拒绝')}</option><option value="2">${t('位置不可用')}</option><option value="3">${t('请求超时')}</option></select></div>
              <div class="pw-actions"><button class="pw-button pw-primary" id="pw-save-location">${t('保存定位设置')}</button><button class="pw-button" id="pw-test-location">${t('运行自检')}</button></div>
            </section>
            <section class="pw-panel" data-panel="favorites">
              <h3 class="pw-section-title">${t('收藏地点')}</h3><p class="pw-section-note">${t('收藏后会出现在 Tampermonkey 菜单中，可一键切换并开启定位。')}</p>
              <div class="pw-card"><div class="pw-favorite-compose"><input id="pw-favorite-name" type="text" maxlength="40" placeholder="${t('地点名称')}"><button class="pw-button pw-primary" id="pw-add-favorite">${t('收藏当前坐标')}</button></div></div>
              <div class="pw-favorite-list" id="pw-favorite-list"></div>
            </section>
          </div>
          <div class="pw-status" id="pw-settings-status" aria-live="polite">${t('偏好设置自动保存；坐标修改需点击保存。')}</div>
        </main>
      </div>`;

    const titles = { overview: t('概览'), notifications: t('通知'), location: t('定位'), favorites: t('收藏地点') };
    const watchToggle = overlay.querySelector('#pw-watch-toggle');
    const languageSelect = overlay.querySelector('#pw-language');
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
    const searchInput = overlay.querySelector('#pw-place-query');
    const searchButton = overlay.querySelector('#pw-search-button');
    const searchNote = overlay.querySelector('#pw-search-note');
    const searchResults = overlay.querySelector('#pw-search-results');
    let searchRevision = 0;
    let map = null;
    let marker = null;

    const setStatus = (message) => { status.textContent = message; };
    const setAllChecked = (toggles, checked) => toggles.forEach((toggle) => { toggle.checked = checked; });
    const refreshConfigurationUi = () => {
      const telegramConfigured = isTelegramConfigured();
      const locationConfigured = isLocationConfigured();
      const telegramBadge = overlay.querySelector('#pw-telegram-badge');
      const locationBadge = overlay.querySelector('#pw-location-badge');
      telegramBadge.textContent = telegramConfigured ? t('已配置') : t('未配置');
      telegramBadge.classList.toggle('is-unconfigured', !telegramConfigured);
      locationBadge.textContent = locationConfigured ? t('已配置') : t('未配置');
      locationBadge.classList.toggle('is-unconfigured', !locationConfigured);
      overlay.querySelector('#pw-notification-summary').textContent = telegramConfigured ? t('Telegram、桌面通知、声音和标题闪烁') : t('尚未配置 Telegram；请前往“通知”设置');
      overlay.querySelector('#pw-location-summary').textContent = locationConfigured ? t('仅作用于 Poll Everywhere 页面') : t('尚未保存定位设置');
      notificationToggles.forEach((toggle) => { toggle.disabled = !telegramConfigured; });
      locationToggles.forEach((toggle) => { toggle.disabled = !locationConfigured; });
      setAllChecked(notificationToggles, telegramConfigured && Boolean(GM_getValue(STORAGE_KEYS.notificationsEnabled, true)));
      setAllChecked(locationToggles, locationConfigured && isLocationMockEnabled());
      tokenInput.placeholder = telegramConfigured ? t('已保存；留空保持不变') : t('从 @BotFather 复制完整 Token');
      chatIdInput.value = String(GM_getValue(STORAGE_KEYS.chatId, ''));
    };

    const setFormPosition = (position, message = '', recenter = true) => {
      latitude.value = Number(position.latitude).toFixed(6);
      longitude.value = Number(position.longitude).toFixed(6);
      if (map && marker) {
        const latLng = [Number(position.latitude), Number(position.longitude)];
        marker.setLatLng(latLng);
        if (recenter) map.setView(latLng, Math.max(map.getZoom(), 15));
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
        setStatus(t('地图组件加载失败，仍可手动输入坐标。'));
        return;
      }
      const initialPosition = [Number(latitude.value), Number(longitude.value)];
      map = leaflet.map(overlay.querySelector('#pw-location-map'), {
        scrollWheelZoom: false,
        zoomControl: false,
      }).setView(initialPosition, 15);
      leaflet.control.zoom({ zoomInTitle: t('放大'), zoomOutTitle: t('缩小') }).addTo(map);
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      marker = leaflet.marker(initialPosition, {
        draggable: true,
        autoPan: true,
        title: t('拖动选择位置'),
        icon: leaflet.divIcon({ className: 'pw-map-pin', iconSize: [26, 36], iconAnchor: [12, 29] }),
      }).addTo(map);
      map.on('click', (event) => setFormPosition(
        { latitude: event.latlng.lat, longitude: event.latlng.lng },
        t('地图位置已选择；保存后生效。'),
        false,
      ));
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        setFormPosition(
          { latitude: position.lat, longitude: position.lng },
          t('标记位置已更新；保存后生效。'),
          false,
        );
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
    languageSelect.value = languagePreference();
    if (draftValues) {
      Object.entries(draftValues).forEach(([id, value]) => {
        const input = overlay.querySelector(`#${id}`);
        if (input) input.value = value;
      });
    }
    (document.body || document.documentElement).appendChild(overlay);

    const closePanel = () => {
      searchRevision += 1;
      placeSearch.cancel();
      map?.remove();
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', onKeyDown);
    overlay.querySelector('.pw-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closePanel(); });
    overlay.querySelectorAll('.pw-nav-button').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.section)));
    languageSelect.addEventListener('change', () => {
      const drafts = Object.fromEntries([...overlay.querySelectorAll('input[id], select[id]')]
        .filter((input) => input.id !== 'pw-language' && input.type !== 'checkbox')
        .map((input) => [input.id, input.value]));
      GM_setValue(LANGUAGE_KEY, languageSelect.value);
      closePanel();
      refreshControlMenus();
      setBadge(state, GM_getValue(STORAGE_KEYS.enabled, true) ? '' : t('PollEv Watcher：监测已暂停'));
      updateLocationBadge();
      openSettingsPanel('overview', drafts);
    });

    searchInput.addEventListener('input', () => {
      searchRevision += 1;
      placeSearch.cancel();
      searchButton.disabled = false;
      searchButton.textContent = t('搜索');
      searchResults.replaceChildren();
      searchNote.textContent = '';
    });
    overlay.querySelector('#pw-place-search').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (searchButton.disabled) return;
      const revision = ++searchRevision;
      searchResults.replaceChildren();
      searchButton.disabled = true;
      searchButton.textContent = t('搜索中…');
      searchNote.textContent = t('正在搜索地点…');
      try {
        const results = await placeSearch.search(searchInput.value);
        if (revision !== searchRevision) return;
        searchNote.textContent = results.length ? t('选择一个结果，或继续在地图上调整；保存后生效。') : t('没有找到地点，请补充城市或尝试其他名称，也可以直接在地图选点。');
        results.forEach((result) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'pw-search-result';
          const name = document.createElement('strong');
          name.textContent = result.name;
          const address = document.createElement('small');
          address.textContent = result.address || `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`;
          button.append(name, address);
          button.addEventListener('click', () => {
            setFormPosition(result, t('已选择“{name}”；请保存定位设置后生效。', { name: result.name }));
            searchResults.replaceChildren();
            searchNote.textContent = t('已选择：{name}。可以拖动标记微调。', { name: result.name });
          });
          searchResults.appendChild(button);
        });
      } catch (error) {
        if (revision === searchRevision) searchNote.textContent = error.message;
      } finally {
        if (revision === searchRevision) {
          searchButton.disabled = false;
          searchButton.textContent = t('搜索');
        }
      }
    });

    watchToggle.addEventListener('change', () => {
      GM_setValue(STORAGE_KEYS.enabled, watchToggle.checked);
      evaluateState();
      refreshControlMenus();
      setStatus(t('状态监测已{state}。', { state: t(watchToggle.checked ? '开启' : '暂停') }));
    });
    notificationToggles.forEach((toggle) => toggle.addEventListener('change', () => {
      GM_setValue(STORAGE_KEYS.notificationsEnabled, toggle.checked);
      setAllChecked(notificationToggles, toggle.checked);
      refreshControlMenus();
      setStatus(t('通知已{state}。', { state: t(toggle.checked ? '开启' : '关闭') }));
    }));
    locationToggles.forEach((toggle) => toggle.addEventListener('change', () => {
      GM_setValue(STORAGE_KEYS.locationEnabled, toggle.checked);
      setAllChecked(locationToggles, toggle.checked);
      updateLocationBadge();
      refreshControlMenus();
      setStatus(t('定位模拟已{state}。请刷新页面后重新检查定位。', { state: t(toggle.checked ? '开启' : '关闭') }));
    }));

    overlay.querySelector('#pw-save-telegram').addEventListener('click', () => {
      const currentToken = String(GM_getValue(STORAGE_KEYS.botToken, '')).trim();
      const nextToken = tokenInput.value.trim() || currentToken;
      const nextChatId = chatIdInput.value.trim();
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(nextToken)) {
        setStatus(t('Token 格式不正确，请从 @BotFather 复制完整 Token。'));
        return;
      }
      if (!/^-?\d+$/.test(nextChatId)) {
        setStatus(t('Chat ID 应为一串数字；可先给机器人发送 /start，再自动检测。'));
        return;
      }
      GM_setValue(STORAGE_KEYS.botToken, nextToken);
      GM_setValue(STORAGE_KEYS.chatId, nextChatId);
      tokenInput.value = '';
      refreshConfigurationUi();
      refreshControlMenus();
      setStatus(t('Telegram 配置已保存。'));
    });
    overlay.querySelector('#pw-detect-chat').addEventListener('click', async () => {
      const candidateToken = tokenInput.value.trim() || String(GM_getValue(STORAGE_KEYS.botToken, '')).trim();
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(candidateToken)) {
        setStatus(t('请先输入有效的 Bot Token。'));
        return;
      }
      setStatus(t('正在检测最近的 Telegram 对话…'));
      try {
        const chat = await detectLatestTelegramChat(candidateToken);
        if (!chat?.id) {
          setStatus(t('没有检测到对话。请先给机器人发送 /start，然后重试。'));
          return;
        }
        chatIdInput.value = String(chat.id);
        const detectedName = normalizeText([chat.first_name, chat.last_name, chat.title].filter(Boolean).join(' '));
        setStatus(t('已检测到 Chat ID{name}；请点击“保存配置”。', { name: detectedName ? ` (${detectedName})` : '' }));
      } catch (error) {
        setStatus(t('检测失败：{error}', { error: error.message }));
      }
    });
    overlay.querySelector('#pw-test-telegram').addEventListener('click', async () => {
      if (!isTelegramConfigured()) {
        setStatus(t('请先保存 Telegram 配置。'));
        return;
      }
      setStatus(t('正在发送测试通知…'));
      try {
        await sendTelegramMessage(`${t('✅ PollEv Watcher 测试成功')}\n${location.href}`);
        setStatus(t('Telegram 测试通知已发送。'));
      } catch (error) {
        setStatus(t('发送失败：{error}', { error: error.message }));
      }
    });
    overlay.querySelector('#pw-delete-telegram').addEventListener('click', () => {
      if (!window.confirm(t('确定删除保存在 Tampermonkey 中的 Bot Token 和 Chat ID 吗？'))) return;
      GM_deleteValue(STORAGE_KEYS.botToken);
      GM_deleteValue(STORAGE_KEYS.chatId);
      tokenInput.value = '';
      refreshConfigurationUi();
      refreshControlMenus();
      setStatus(t('Telegram 配置已删除。'));
    });

    overlay.querySelector('#pw-save-location').addEventListener('click', () => {
      const values = { latitude: Number(latitude.value), longitude: Number(longitude.value), accuracy: Number(accuracy.value), errorCode: Number(errorMode.value) };
      if (!Number.isFinite(values.latitude) || values.latitude < -90 || values.latitude > 90
        || !Number.isFinite(values.longitude) || values.longitude < -180 || values.longitude > 180
        || !Number.isFinite(values.accuracy) || values.accuracy <= 0 || ![0, 1, 2, 3].includes(values.errorCode)) {
        setStatus(t('坐标、精度或错误模式格式不正确。'));
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
      setStatus(t('定位设置已保存。现在可以开启定位模拟；开启后请刷新页面。'));
    });
    overlay.querySelector('#pw-test-location').addEventListener('click', testLocationMock);

    function renderSavedLocations() {
      favoriteList.replaceChildren();
      const locations = savedLocations();
      if (!locations.length) {
        const empty = document.createElement('div');
        empty.className = 'pw-card pw-note';
        empty.textContent = t('还没有收藏地点。请先在“定位”中选好坐标，再返回这里收藏。');
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
        useButton.textContent = t('使用');
        useButton.addEventListener('click', () => {
          activateSavedLocation(savedLocation);
          errorMode.value = '0';
          accuracy.value = String(savedLocation.accuracy);
          setFormPosition(savedLocation);
          refreshConfigurationUi();
          setStatus(t('已切换到“{name}”并开启定位；请刷新页面。', { name: savedLocation.name }));
        });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'pw-button pw-small pw-danger';
        deleteButton.textContent = t('删除');
        deleteButton.addEventListener('click', () => {
          if (!window.confirm(t('删除收藏地点“{name}”吗？', { name: savedLocation.name }))) return;
          storeSavedLocations(savedLocations().filter(({ id }) => id !== savedLocation.id));
          refreshControlMenus();
          renderSavedLocations();
          setStatus(t('已删除“{name}”。', { name: savedLocation.name }));
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
        setStatus(t('请先输入收藏地点名称。'));
        return;
      }
      if (!Number.isFinite(nextLocation.latitude) || nextLocation.latitude < -90 || nextLocation.latitude > 90
        || !Number.isFinite(nextLocation.longitude) || nextLocation.longitude < -180 || nextLocation.longitude > 180
        || !Number.isFinite(nextLocation.accuracy) || nextLocation.accuracy <= 0) {
        setStatus(t('当前坐标或精度格式不正确，无法收藏。'));
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
      setStatus(duplicateIndex >= 0 ? t('已更新收藏地点“{name}”。', { name }) : t('已收藏“{name}”。', { name }));
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
