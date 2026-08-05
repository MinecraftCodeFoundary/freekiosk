import { ApiService } from './ApiService';
import { StorageService } from './storage';

const REST_API_KEYS = new Set<string>([
  StorageService.KEYS.REST_API_ENABLED,
  StorageService.KEYS.REST_API_PORT,
  StorageService.KEYS.REST_API_ALLOW_CONTROL,
]);

const MQTT_CONNECTION_KEYS = new Set<string>([
  StorageService.KEYS.MQTT_ENABLED,
  StorageService.KEYS.MQTT_BROKER_URL,
  StorageService.KEYS.MQTT_PORT,
  StorageService.KEYS.MQTT_USERNAME,
  StorageService.KEYS.MQTT_CLIENT_ID,
  StorageService.KEYS.MQTT_BASE_TOPIC,
  StorageService.KEYS.MQTT_DISCOVERY_PREFIX,
  StorageService.KEYS.MQTT_STATUS_INTERVAL,
  StorageService.KEYS.MQTT_ALLOW_CONTROL,
  StorageService.KEYS.MQTT_DEVICE_NAME,
]);

export interface RemoteIntegrationReloadTargets {
  restApi: boolean;
  mqtt: boolean;
}

export function getRemoteIntegrationReloadTargets(
  changedKeys: readonly string[],
): RemoteIntegrationReloadTargets {
  return {
    restApi: changedKeys.some(key => REST_API_KEYS.has(key)),
    mqtt: changedKeys.some(key => MQTT_CONNECTION_KEYS.has(key)),
  };
}

/**
 * Reconcile long-lived native integrations after their persisted remote
 * settings change. Visual/runtime settings are reloaded separately by the
 * active screen, but REST and MQTT otherwise keep their old native process.
 */
export async function applyRemoteConfigRuntimeSideEffects(
  changedKeys: readonly string[],
): Promise<void> {
  const targets = getRemoteIntegrationReloadTargets(changedKeys);
  if (!targets.restApi && !targets.mqtt) return;

  await ApiService.reloadIntegrationsFromSettings(targets);
}
