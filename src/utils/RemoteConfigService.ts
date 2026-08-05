import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './storage';
import { getSecureRemoteConfigToken } from './secureStorage';
import { fetchRemoteConfig } from './RemoteConfigHttpClient';
import { applyRemoteConfigRuntimeSideEffects } from './RemoteConfigRuntime';
import type { RemoteConfigState } from '../types/remoteConfig';

const MAX_RESPONSE_CHARS = 1_048_576;
const MAX_SETTINGS = 512;

const PROTECTED_KEYS = new Set([
  '@kiosk_pin',
  '@kiosk_pin_secure_fallback',
  '@kiosk_pin_attempts',
  '@kiosk_pin_lockout',
  '@kiosk_rest_api_key',
  '@kiosk_mqtt_password',
  '@kiosk_basic_auth_password',
  '@kiosk_http_basic_auth_username',
  '@kiosk_remote_config_preferences',
  '@kiosk_remote_config_state',
]);

type StorageKeyName = keyof typeof StorageService.KEYS;

// Remote management is deliberately opt-in. New storage keys remain blocked
// until they are reviewed and added here, rather than becoming writable by
// accident when StorageService grows.
const REMOTE_WRITABLE_KEY_NAMES: StorageKeyName[] = [
  'URL',
  'AUTO_RELOAD',
  'KIOSK_ENABLED',
  'AUTO_LAUNCH',
  'SCREEN_LOCK_COMPAT',
  'DEFAULT_LAUNCHER',
  'INTERCOM_MODE',
  'SCREENSAVER_ENABLED',
  'SCREENSAVER_INACTIVITY_ENABLED',
  'SCREENSAVER_INACTIVITY_DELAY',
  'SCREENSAVER_MOTION_ENABLED',
  'SCREENSAVER_MOTION_SENSITIVITY',
  'SCREENSAVER_MOTION_DELAY',
  'SCREENSAVER_BRIGHTNESS',
  'SCREENSAVER_TYPE',
  'SCREENSAVER_URL',
  'SCREENSAVER_VIDEO_ITEMS',
  'SCREENSAVER_VIDEO_LOOP',
  'DEFAULT_BRIGHTNESS',
  'DISPLAY_MODE',
  'EXTERNAL_APP_PACKAGE',
  'EXTERNAL_APP_MODE',
  'AUTO_RELAUNCH_APP',
  'OVERLAY_BUTTON_VISIBLE',
  'OVERLAY_BUTTON_POSITION',
  'PIN_MAX_ATTEMPTS',
  'STATUS_BAR_ENABLED',
  'STATUS_BAR_ON_OVERLAY',
  'STATUS_BAR_ON_RETURN',
  'STATUS_BAR_SHOW_BATTERY',
  'STATUS_BAR_SHOW_WIFI',
  'STATUS_BAR_SHOW_BLUETOOTH',
  'STATUS_BAR_SHOW_VOLUME',
  'STATUS_BAR_SHOW_TIME',
  'STATUS_BAR_THEME',
  'EXTERNAL_APP_TEST_MODE',
  'BACK_BUTTON_MODE',
  'BACK_BUTTON_TIMER_DELAY',
  'KEYBOARD_MODE',
  'PIN_MODE',
  'URL_ROTATION_ENABLED',
  'URL_ROTATION_LIST',
  'URL_ROTATION_INTERVAL',
  'URL_PLANNER_ENABLED',
  'URL_PLANNER_EVENTS',
  'REST_API_ENABLED',
  'REST_API_PORT',
  'REST_API_ALLOW_CONTROL',
  'ALLOW_POWER_BUTTON',
  'BLOCK_FACTORY_RESET',
  'ALLOW_NOTIFICATIONS',
  'ALLOW_SYSTEM_INFO',
  'RETURN_TAP_COUNT',
  'RETURN_TAP_TIMEOUT',
  'RETURN_MODE',
  'RETURN_BUTTON_POSITION',
  'VOLUME_UP_5TAP_ENABLED',
  'BLOCKING_OVERLAYS_ENABLED',
  'BLOCKING_OVERLAYS_REGIONS',
  'MOTION_CAMERA_POSITION',
  'WEBVIEW_BACK_BUTTON_ENABLED',
  'WEBVIEW_BACK_BUTTON_X_PERCENT',
  'WEBVIEW_BACK_BUTTON_Y_PERCENT',
  'AUTO_BRIGHTNESS_ENABLED',
  'AUTO_BRIGHTNESS_MIN',
  'AUTO_BRIGHTNESS_MAX',
  'AUTO_BRIGHTNESS_OFFSET',
  'AUTO_BRIGHTNESS_UPDATE_INTERVAL',
  'AUTO_BRIGHTNESS_SAVED_MANUAL',
  'BRIGHTNESS_MANAGEMENT_ENABLED',
  'SCREEN_SCHEDULER_ENABLED',
  'SCREEN_SCHEDULER_RULES',
  'SCREEN_SCHEDULER_WAKE_ON_TOUCH',
  'KEEP_SCREEN_ON',
  'AUTO_WAKE_ON_SCREEN_OFF',
  'INACTIVITY_RETURN_ENABLED',
  'INACTIVITY_RETURN_DELAY',
  'INACTIVITY_RETURN_RESET_ON_NAV',
  'INACTIVITY_RETURN_CLEAR_CACHE',
  'INACTIVITY_RETURN_SCROLL_TOP',
  'URL_FILTER_ENABLED',
  'URL_FILTER_MODE',
  'URL_FILTER_LIST',
  'URL_FILTER_SHOW_FEEDBACK',
  'PDF_VIEWER_ENABLED',
  'PRINT_ENABLED',
  'PRINT_PAPER_SIZE',
  'WEBVIEW_ZOOM_LEVEL',
  'WEBVIEW_ZOOM_MODE',
  'DISABLE_USER_ZOOM',
  'CUSTOM_USER_AGENT',
  'PAUSE_WEB_MEDIA_WHEN_HIDDEN',
  'MQTT_ENABLED',
  'MQTT_BROKER_URL',
  'MQTT_PORT',
  'MQTT_USERNAME',
  'MQTT_CLIENT_ID',
  'MQTT_BASE_TOPIC',
  'MQTT_DISCOVERY_PREFIX',
  'MQTT_STATUS_INTERVAL',
  'MQTT_ALLOW_CONTROL',
  'MQTT_DEVICE_NAME',
  'MQTT_MOTION_ALWAYS_ON',
  'BETA_UPDATES_ENABLED',
  'MANAGED_APPS',
  'MEDIA_PLAYER_ITEMS',
  'MEDIA_PLAYER_AUTOPLAY',
  'MEDIA_PLAYER_LOOP',
  'MEDIA_PLAYER_SHUFFLE',
  'MEDIA_PLAYER_IMAGE_DURATION',
  'MEDIA_PLAYER_SHOW_CONTROLS',
  'MEDIA_PLAYER_FIT_MODE',
  'MEDIA_PLAYER_BG_COLOR',
  'MEDIA_PLAYER_TRANSITION',
  'MEDIA_PLAYER_TRANSITION_DURATION',
  'MEDIA_PLAYER_MUTE',
  'SCREENSAVER_DELAY',
  'MOTION_DETECTION_ENABLED',
  'MOTION_SENSITIVITY',
  'MOTION_DELAY',
  'DASHBOARD_MODE_ENABLED',
  'DASHBOARD_TILES',
  'LOCKSCREEN_CONTROLS_ENABLED',
  'LOCKSCREEN_WIFI_ENABLED',
  'LOCKSCREEN_BLUETOOTH_ENABLED',
  'LOCKSCREEN_EMERGENCY_CALL_ENABLED',
  'LOCKSCREEN_AUDIO_ENABLED',
  'LOCKSCREEN_FLASHLIGHT_ENABLED',
  'LOCKSCREEN_BRIGHTNESS_ENABLED',
  'LOCKSCREEN_ROTATION_LOCK_ENABLED',
];

const BOOLEAN_KEY_NAMES: StorageKeyName[] = [
  'AUTO_RELOAD', 'KIOSK_ENABLED', 'AUTO_LAUNCH', 'SCREEN_LOCK_COMPAT',
  'DEFAULT_LAUNCHER', 'INTERCOM_MODE', 'SCREENSAVER_ENABLED',
  'SCREENSAVER_INACTIVITY_ENABLED', 'SCREENSAVER_MOTION_ENABLED',
  'SCREENSAVER_VIDEO_LOOP', 'AUTO_RELAUNCH_APP', 'OVERLAY_BUTTON_VISIBLE',
  'STATUS_BAR_ENABLED', 'STATUS_BAR_ON_OVERLAY', 'STATUS_BAR_ON_RETURN',
  'STATUS_BAR_SHOW_BATTERY', 'STATUS_BAR_SHOW_WIFI', 'STATUS_BAR_SHOW_BLUETOOTH',
  'STATUS_BAR_SHOW_VOLUME', 'STATUS_BAR_SHOW_TIME', 'EXTERNAL_APP_TEST_MODE',
  'URL_ROTATION_ENABLED', 'URL_PLANNER_ENABLED', 'REST_API_ENABLED',
  'REST_API_ALLOW_CONTROL', 'ALLOW_POWER_BUTTON', 'BLOCK_FACTORY_RESET',
  'ALLOW_NOTIFICATIONS', 'ALLOW_SYSTEM_INFO', 'VOLUME_UP_5TAP_ENABLED',
  'BLOCKING_OVERLAYS_ENABLED', 'WEBVIEW_BACK_BUTTON_ENABLED',
  'AUTO_BRIGHTNESS_ENABLED', 'BRIGHTNESS_MANAGEMENT_ENABLED',
  'SCREEN_SCHEDULER_ENABLED', 'SCREEN_SCHEDULER_WAKE_ON_TOUCH', 'KEEP_SCREEN_ON',
  'AUTO_WAKE_ON_SCREEN_OFF', 'INACTIVITY_RETURN_ENABLED',
  'INACTIVITY_RETURN_RESET_ON_NAV', 'INACTIVITY_RETURN_CLEAR_CACHE',
  'INACTIVITY_RETURN_SCROLL_TOP', 'URL_FILTER_ENABLED', 'URL_FILTER_SHOW_FEEDBACK',
  'PDF_VIEWER_ENABLED', 'PRINT_ENABLED', 'DISABLE_USER_ZOOM',
  'PAUSE_WEB_MEDIA_WHEN_HIDDEN', 'MQTT_ENABLED', 'MQTT_ALLOW_CONTROL',
  'MQTT_MOTION_ALWAYS_ON', 'BETA_UPDATES_ENABLED', 'MEDIA_PLAYER_AUTOPLAY',
  'MEDIA_PLAYER_LOOP', 'MEDIA_PLAYER_SHUFFLE', 'MEDIA_PLAYER_SHOW_CONTROLS',
  'MEDIA_PLAYER_TRANSITION', 'MEDIA_PLAYER_MUTE', 'MOTION_DETECTION_ENABLED',
  'DASHBOARD_MODE_ENABLED', 'LOCKSCREEN_CONTROLS_ENABLED', 'LOCKSCREEN_WIFI_ENABLED',
  'LOCKSCREEN_BLUETOOTH_ENABLED', 'LOCKSCREEN_EMERGENCY_CALL_ENABLED',
  'LOCKSCREEN_AUDIO_ENABLED', 'LOCKSCREEN_FLASHLIGHT_ENABLED',
  'LOCKSCREEN_BRIGHTNESS_ENABLED', 'LOCKSCREEN_ROTATION_LOCK_ENABLED',
];

const NUMERIC_KEY_NAMES: StorageKeyName[] = [
  'SCREENSAVER_INACTIVITY_DELAY', 'SCREENSAVER_MOTION_DELAY',
  'SCREENSAVER_BRIGHTNESS', 'DEFAULT_BRIGHTNESS', 'PIN_MAX_ATTEMPTS',
  'BACK_BUTTON_TIMER_DELAY', 'URL_ROTATION_INTERVAL', 'REST_API_PORT',
  'RETURN_TAP_COUNT', 'RETURN_TAP_TIMEOUT', 'WEBVIEW_BACK_BUTTON_X_PERCENT',
  'WEBVIEW_BACK_BUTTON_Y_PERCENT', 'AUTO_BRIGHTNESS_MIN', 'AUTO_BRIGHTNESS_MAX',
  'AUTO_BRIGHTNESS_OFFSET', 'AUTO_BRIGHTNESS_UPDATE_INTERVAL',
  'AUTO_BRIGHTNESS_SAVED_MANUAL', 'INACTIVITY_RETURN_DELAY', 'WEBVIEW_ZOOM_LEVEL',
  'MQTT_PORT', 'MQTT_STATUS_INTERVAL', 'MEDIA_PLAYER_IMAGE_DURATION',
  'MEDIA_PLAYER_TRANSITION_DURATION', 'SCREENSAVER_DELAY', 'MOTION_DELAY',
];

const JSON_ARRAY_KEY_NAMES: StorageKeyName[] = [
  'SCREENSAVER_VIDEO_ITEMS', 'URL_ROTATION_LIST', 'URL_PLANNER_EVENTS',
  'BLOCKING_OVERLAYS_REGIONS', 'SCREEN_SCHEDULER_RULES', 'URL_FILTER_LIST',
  'MANAGED_APPS', 'MEDIA_PLAYER_ITEMS', 'DASHBOARD_TILES',
];

export type RemoteConfigTrigger = 'manual' | 'startup' | 'foreground' | 'interval';
export type RemoteConfigSyncStatus = 'applied' | 'unchanged' | 'skipped' | 'error';

export interface RemoteConfigSyncOptions {
  trigger: RemoteConfigTrigger;
  force?: boolean;
  ignoreDisabled?: boolean;
}

export interface RemoteConfigSyncResult {
  status: RemoteConfigSyncStatus;
  applied: boolean;
  message: string;
  changedKeys: string[];
  ignoredKeys: string[];
  revision: string | null;
}

export interface ParsedRemoteConfig {
  entries: [string, string][];
  ignoredKeys: string[];
  revision: string | null;
  contentHash: string;
}

interface RemoteConfigDocument {
  version?: unknown;
  revision?: unknown;
  settings?: unknown;
}

let inFlightSync: Promise<RemoteConfigSyncResult> | null = null;
let pendingForcedSync: Promise<RemoteConfigSyncResult> | null = null;

const emptyResult = (
  status: RemoteConfigSyncStatus,
  message: string,
  revision: string | null = null,
): RemoteConfigSyncResult => ({
  status,
  applied: false,
  message,
  changedKeys: [],
  ignoredKeys: [],
  revision,
});

const keysFromNames = (names: StorageKeyName[]): Set<string> => new Set(
  names
    .map(name => StorageService.KEYS[name])
    .filter((key): key is string => typeof key === 'string'),
);

const REMOTE_WRITABLE_KEYS = keysFromNames(REMOTE_WRITABLE_KEY_NAMES);
const BOOLEAN_KEYS = keysFromNames(BOOLEAN_KEY_NAMES);
const NUMERIC_KEYS = keysFromNames(NUMERIC_KEY_NAMES);
const JSON_ARRAY_KEYS = keysFromNames(JSON_ARRAY_KEY_NAMES);
const ENUM_VALUES = new Map<string, Set<string>>([
  [StorageService.KEYS.SCREENSAVER_MOTION_SENSITIVITY, new Set(['low', 'medium', 'high'])],
  [StorageService.KEYS.SCREENSAVER_TYPE, new Set(['dim', 'url', 'video'])],
  [StorageService.KEYS.DISPLAY_MODE, new Set(['webview', 'external_app', 'media_player'])],
  [StorageService.KEYS.EXTERNAL_APP_MODE, new Set(['single', 'multi'])],
  [StorageService.KEYS.STATUS_BAR_THEME, new Set(['dark', 'light'])],
  [StorageService.KEYS.PIN_MODE, new Set(['numeric', 'alphanumeric'])],
  [StorageService.KEYS.MOTION_CAMERA_POSITION, new Set(['front', 'back'])],
  [StorageService.KEYS.URL_FILTER_MODE, new Set(['blacklist', 'whitelist'])],
  [StorageService.KEYS.WEBVIEW_ZOOM_MODE, new Set(['standard', 'fit'])],
  [StorageService.KEYS.MEDIA_PLAYER_FIT_MODE, new Set(['contain', 'cover', 'fill'])],
]);

const getAllowedSettingsKeys = (): Set<string> => {
  return REMOTE_WRITABLE_KEYS;
};

const validateSettingValue = (key: string, value: string): void => {
  if (BOOLEAN_KEYS.has(key) && value !== 'true' && value !== 'false') {
    throw new Error(`Setting ${key} must be "true" or "false".`);
  }

  if (NUMERIC_KEYS.has(key)) {
    if (!value.trim() || !Number.isFinite(Number(value))) {
      throw new Error(`Setting ${key} must be a finite number.`);
    }
  }

  if (JSON_ARRAY_KEYS.has(key)) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) throw new Error('not an array');
    } catch {
      throw new Error(`Setting ${key} must be a JSON-encoded array.`);
    }
  }

  const acceptedValues = ENUM_VALUES.get(key);
  if (acceptedValues && !acceptedValues.has(value)) {
    throw new Error(
      `Setting ${key} must be one of: ${Array.from(acceptedValues).join(', ')}.`,
    );
  }
};

const normalizeRevision = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 200);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

/**
 * Validate the configured source before it is persisted or requested.
 * HTTPS is the default. Plain HTTP requires an explicit opt-in for LAN setups.
 */
export function validateRemoteConfigUrl(value: string, allowInsecureHttp: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Configuration URL is required.';

  try {
    const parsed = new URL(trimmed) as unknown as { username: string; password: string; protocol: string };
    if (parsed.username || parsed.password) {
      return 'Credentials in the URL are not allowed. Use the Bearer token field instead.';
    }
    if (parsed.protocol === 'https:') return null;
    if (parsed.protocol === 'http:') {
      return allowInsecureHttp
        ? null
        : 'HTTP is disabled by default. Enable insecure HTTP only for a trusted local network.';
    }
    return 'Only HTTPS and HTTP URLs are supported.';
  } catch {
    return 'Enter a valid absolute configuration URL.';
  }
}

/** A small deterministic hash used for change detection, not for authentication. */
export function calculateRemoteConfigHash(entries: [string, string][]): string {
  const canonical = [...entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}\u0000${value}`)
    .join('\u0001');

  let hash = 5381;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = (hash * 33 + canonical.charCodeAt(index)) % 4_294_967_296;
  }
  return Math.floor(hash).toString(16).padStart(8, '0');
}

/**
 * Parse an exported FreeKiosk backup and reduce it to settings that remote
 * management is allowed to change. Unknown and protected keys are reported and
 * ignored so an ordinary exported backup can be hosted without exposing secrets.
 */
export function parseRemoteConfigDocument(jsonContent: string): ParsedRemoteConfig {
  let document: RemoteConfigDocument;
  try {
    document = JSON.parse(jsonContent) as RemoteConfigDocument;
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Remote configuration must be a JSON object.');
  }
  if (document.version !== '1.0') {
    throw new Error('Unsupported remote configuration version. Expected version "1.0".');
  }
  if (!document.settings || typeof document.settings !== 'object' || Array.isArray(document.settings)) {
    throw new Error('Remote configuration is missing a valid settings object.');
  }

  const rawEntries = Object.entries(document.settings as Record<string, unknown>);
  if (rawEntries.length > MAX_SETTINGS) {
    throw new Error(`Remote configuration contains too many settings (maximum ${MAX_SETTINGS}).`);
  }

  const allowedKeys = getAllowedSettingsKeys();
  const entries: [string, string][] = [];
  const ignoredKeys: string[] = [];

  for (const [key, value] of rawEntries) {
    if (PROTECTED_KEYS.has(key) || !allowedKeys.has(key)) {
      ignoredKeys.push(key);
      continue;
    }
    if (typeof value !== 'string') {
      throw new Error(`Setting ${key} must be an AsyncStorage string value.`);
    }
    if (value.length > MAX_RESPONSE_CHARS) {
      throw new Error(`Setting ${key} is too large.`);
    }
    validateSettingValue(key, value);
    entries.push([key, value]);
  }

  if (entries.length === 0) {
    throw new Error('Remote configuration does not contain any supported settings.');
  }

  return {
    entries,
    ignoredKeys,
    revision: normalizeRevision(document.revision),
    contentHash: calculateRemoteConfigHash(entries),
  };
}

const applySettingsAndStateWithRollback = async (
  entries: [string, string][],
  buildState: (changedKeys: string[]) => RemoteConfigState,
): Promise<string[]> => {
  const stateKey = StorageService.KEYS.REMOTE_CONFIG_STATE;
  const keys = [...entries.map(([key]) => key), stateKey];
  const previousPairs = await AsyncStorage.multiGet(keys);
  const previous = new Map(previousPairs);
  const changedEntries = entries.filter(([key, value]) => previous.get(key) !== value);
  const changedKeys = changedEntries.map(([key]) => key);
  const stateEntry: [string, string] = [stateKey, JSON.stringify(buildState(changedKeys))];
  const writes = [...changedEntries, stateEntry];

  try {
    await AsyncStorage.multiSet(writes);
  } catch (applyError) {
    try {
      const restorePairs = writes
        .map(([key]) => [key, previous.get(key)] as [string, string | null | undefined])
        .filter((pair): pair is [string, string] => typeof pair[1] === 'string');
      const removeKeys = writes
        .map(([key]) => key)
        .filter(key => previous.get(key) == null);

      if (restorePairs.length > 0) await AsyncStorage.multiSet(restorePairs);
      if (removeKeys.length > 0) await AsyncStorage.multiRemove(removeKeys);
    } catch (rollbackError) {
      throw new Error(
        `Failed to apply remote configuration and rollback failed: ${String(rollbackError)}`,
      );
    }
    throw applyError;
  }

  return changedKeys;
};

const saveFailureState = async (
  state: RemoteConfigState,
  checkedAt: string,
  message: string,
): Promise<void> => {
  try {
    await StorageService.saveRemoteConfigState({
      ...state,
      lastCheckedAt: checkedAt,
      lastResult: 'error',
      lastMessage: message,
    });
  } catch (stateError) {
    console.warn('[RemoteConfig] Failed to persist error state:', stateError);
  }
};

const performSync = async (options: RemoteConfigSyncOptions): Promise<RemoteConfigSyncResult> => {
  const preferences = await StorageService.getRemoteConfigPreferences();
  if (!preferences.enabled && !options.ignoreDisabled) {
    return emptyResult('skipped', 'Remote configuration is disabled.');
  }

  const sourceUrl = preferences.url.trim();
  const storedState = await StorageService.getRemoteConfigState();
  const state: RemoteConfigState = storedState.sourceUrl === sourceUrl
    ? storedState
    : {
        ...storedState,
        sourceUrl,
        lastCheckedAt: null,
        etag: null,
        revision: null,
        contentHash: null,
      };
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const validationError = validateRemoteConfigUrl(sourceUrl, preferences.allowInsecureHttp);
  if (validationError) {
    await saveFailureState(state, checkedAt, validationError);
    return emptyResult('error', validationError, state.revision);
  }

  const lastCheckedMs = state.lastCheckedAt ? Date.parse(state.lastCheckedAt) : Number.NaN;
  const intervalMs = preferences.checkIntervalMinutes * 60_000;
  if (!options.force && Number.isFinite(lastCheckedMs) && now - lastCheckedMs < intervalMs) {
    return emptyResult('skipped', 'The next automatic check is not due yet.', state.revision);
  }

  try {
    const token = await getSecureRemoteConfigToken(sourceUrl);
    const response = await fetchRemoteConfig({
      url: sourceUrl,
      token,
      etag: options.force ? null : state.etag,
      allowInsecureHttp: preferences.allowInsecureHttp,
    });
    const latestPreferences = await StorageService.getRemoteConfigPreferences();
    if (latestPreferences.url.trim() !== sourceUrl) {
      return emptyResult('skipped', 'Remote source changed; discarded the previous response.');
    }

    if (response.status === 304) {
      const message = 'Remote configuration has not changed.';
      await StorageService.saveRemoteConfigState({
        ...state,
        lastCheckedAt: checkedAt,
        lastResult: 'not_modified',
        lastMessage: message,
      });
      return emptyResult('unchanged', message, state.revision);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Server returned HTTP ${response.status}.`);
    }

    const body = response.body;
    if (body.length > MAX_RESPONSE_CHARS) {
      throw new Error('Remote configuration exceeds the 1 MiB size limit.');
    }

    const parsed = parseRemoteConfigDocument(body);
    const currentPreferences = await StorageService.getRemoteConfigPreferences();
    if (currentPreferences.url.trim() !== sourceUrl) {
      return emptyResult('skipped', 'Remote source changed; discarded the previous response.');
    }

    const etag = response.etag ?? state.etag;
    const revision = parsed.revision ?? state.revision;
    let message = '';
    const changedKeys = await applySettingsAndStateWithRollback(parsed.entries, keys => {
      const wasApplied = keys.length > 0;
      message = wasApplied
        ? `Applied ${keys.length} remote setting${keys.length === 1 ? '' : 's'}.`
        : 'Remote configuration already matches local settings.';
      return {
        ...state,
        lastCheckedAt: checkedAt,
        lastAppliedAt: wasApplied ? checkedAt : state.lastAppliedAt,
        lastResult: wasApplied ? 'success' : 'not_modified',
        lastMessage: message,
        etag,
        revision,
        contentHash: parsed.contentHash,
      };
    });
    const applied = changedKeys.length > 0;

    if (applied) {
      try {
        await applyRemoteConfigRuntimeSideEffects(changedKeys);
      } catch (runtimeError) {
        // Persistence has already succeeded. Do not report a failed/rolled-back
        // sync when only a best-effort native service restart failed.
        console.warn(
          '[RemoteConfig] Unable to reload a changed native integration:',
          runtimeError,
        );
      }
    }

    return {
      status: applied ? 'applied' : 'unchanged',
      applied,
      message,
      changedKeys,
      ignoredKeys: parsed.ignoredKeys,
      revision,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveFailureState(state, checkedAt, message);
    return emptyResult('error', message, state.revision);
  }
};

const startSync = (options: RemoteConfigSyncOptions): Promise<RemoteConfigSyncResult> => {
  let activePromise: Promise<RemoteConfigSyncResult>;
  activePromise = performSync(options).finally(() => {
    if (inFlightSync === activePromise) inFlightSync = null;
  });
  inFlightSync = activePromise;
  return activePromise;
};

/**
 * Check and apply the configured remote source. All callers share one in-flight
 * request. A forced/manual request arriving behind an automatic check is queued
 * once, so it still bypasses cooldown/ETag and reads the latest saved source.
 */
export function syncRemoteConfig(options: RemoteConfigSyncOptions): Promise<RemoteConfigSyncResult> {
  if (!inFlightSync) return startSync(options);
  if (!options.force) return inFlightSync;

  if (!pendingForcedSync) {
    const currentSync = inFlightSync;
    pendingForcedSync = currentSync.then(
      () => startSync(options),
      () => startSync(options),
    ).finally(() => {
      pendingForcedSync = null;
    });
  }
  return pendingForcedSync;
}
