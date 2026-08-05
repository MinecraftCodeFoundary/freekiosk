jest.mock('../src/utils/ApiService', () => ({
  ApiService: {
    reloadIntegrationsFromSettings: jest.fn(),
  },
}));

jest.mock('../src/utils/storage', () => ({
  StorageService: {
    KEYS: {
      REST_API_ENABLED: '@kiosk_rest_api_enabled',
      REST_API_PORT: '@kiosk_rest_api_port',
      REST_API_ALLOW_CONTROL: '@kiosk_rest_api_allow_control',
      MQTT_ENABLED: '@kiosk_mqtt_enabled',
      MQTT_BROKER_URL: '@kiosk_mqtt_broker_url',
      MQTT_PORT: '@kiosk_mqtt_port',
      MQTT_USERNAME: '@kiosk_mqtt_username',
      MQTT_CLIENT_ID: '@kiosk_mqtt_client_id',
      MQTT_BASE_TOPIC: '@kiosk_mqtt_base_topic',
      MQTT_DISCOVERY_PREFIX: '@kiosk_mqtt_discovery_prefix',
      MQTT_STATUS_INTERVAL: '@kiosk_mqtt_status_interval',
      MQTT_ALLOW_CONTROL: '@kiosk_mqtt_allow_control',
      MQTT_DEVICE_NAME: '@kiosk_mqtt_device_name',
    },
  },
}));

import { ApiService } from '../src/utils/ApiService';
import {
  applyRemoteConfigRuntimeSideEffects,
  getRemoteIntegrationReloadTargets,
} from '../src/utils/RemoteConfigRuntime';

const mockReloadIntegrations = ApiService.reloadIntegrationsFromSettings as jest.MockedFunction<
  typeof ApiService.reloadIntegrationsFromSettings
>;

describe('RemoteConfigRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReloadIntegrations.mockResolvedValue(undefined);
  });

  it('detects only the long-lived integrations affected by changed keys', () => {
    expect(getRemoteIntegrationReloadTargets(['@kiosk_rest_api_port'])).toEqual({
      restApi: true,
      mqtt: false,
    });
    expect(getRemoteIntegrationReloadTargets(['@kiosk_mqtt_base_topic'])).toEqual({
      restApi: false,
      mqtt: true,
    });
    expect(getRemoteIntegrationReloadTargets(['@kiosk_url'])).toEqual({
      restApi: false,
      mqtt: false,
    });
  });

  it('reloads both integrations together when both configurations change', async () => {
    await applyRemoteConfigRuntimeSideEffects([
      '@kiosk_rest_api_enabled',
      '@kiosk_mqtt_enabled',
    ]);

    expect(mockReloadIntegrations).toHaveBeenCalledWith({
      restApi: true,
      mqtt: true,
    });
  });

  it('does not touch native integrations for unrelated remote settings', async () => {
    await applyRemoteConfigRuntimeSideEffects(['@kiosk_url']);

    expect(mockReloadIntegrations).not.toHaveBeenCalled();
  });
});
