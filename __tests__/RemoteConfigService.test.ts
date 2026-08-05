jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    multiGet: jest.fn(),
    multiSet: jest.fn(),
    multiRemove: jest.fn(),
  },
}));

jest.mock('../src/utils/storage', () => ({
  StorageService: {
    KEYS: {
      URL: '@kiosk_url',
      AUTO_RELOAD: '@kiosk_auto_reload',
      PIN: '@kiosk_pin',
      REST_API_KEY: '@kiosk_rest_api_key',
      REMOTE_CONFIG_PREFERENCES: '@kiosk_remote_config_preferences',
      REMOTE_CONFIG_STATE: '@kiosk_remote_config_state',
    },
    getRemoteConfigPreferences: jest.fn(),
    getRemoteConfigState: jest.fn(),
    saveRemoteConfigState: jest.fn(),
  },
}));

jest.mock('../src/utils/RemoteConfigHttpClient', () => ({
  fetchRemoteConfig: jest.fn(),
}));

jest.mock('../src/utils/RemoteConfigRuntime', () => ({
  applyRemoteConfigRuntimeSideEffects: jest.fn(),
}));

jest.mock('../src/utils/secureStorage', () => ({
  getSecureRemoteConfigToken: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from '../src/utils/storage';
import { getSecureRemoteConfigToken } from '../src/utils/secureStorage';
import { fetchRemoteConfig } from '../src/utils/RemoteConfigHttpClient';
import { applyRemoteConfigRuntimeSideEffects } from '../src/utils/RemoteConfigRuntime';
import type { RemoteConfigPreferences, RemoteConfigState } from '../src/types/remoteConfig';
import {
  calculateRemoteConfigHash,
  parseRemoteConfigDocument,
  syncRemoteConfig,
  validateRemoteConfigUrl,
} from '../src/utils/RemoteConfigService';

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockGetPreferences = StorageService.getRemoteConfigPreferences as jest.MockedFunction<
  typeof StorageService.getRemoteConfigPreferences
>;
const mockGetState = StorageService.getRemoteConfigState as jest.MockedFunction<
  typeof StorageService.getRemoteConfigState
>;
const mockSaveState = StorageService.saveRemoteConfigState as jest.MockedFunction<
  typeof StorageService.saveRemoteConfigState
>;
const mockGetToken = getSecureRemoteConfigToken as jest.MockedFunction<
  typeof getSecureRemoteConfigToken
>;
const mockFetchRemoteConfig = fetchRemoteConfig as jest.MockedFunction<
  typeof fetchRemoteConfig
>;
const mockApplyRuntimeSideEffects = applyRemoteConfigRuntimeSideEffects as jest.MockedFunction<
  typeof applyRemoteConfigRuntimeSideEffects
>;

const mockPreferences: RemoteConfigPreferences = {
  enabled: true,
  url: 'https://config.example.test/freekiosk.json',
  allowInsecureHttp: false,
  checkIntervalMinutes: 60,
};

let mockState: RemoteConfigState;

const initialState = (): RemoteConfigState => ({
  sourceUrl: null,
  lastCheckedAt: null,
  lastAppliedAt: null,
  lastResult: 'never',
  lastMessage: '',
  etag: null,
  revision: null,
  contentHash: null,
});

const makeResponse = (
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Awaited<ReturnType<typeof fetchRemoteConfig>> => ({
  status,
  body,
  etag: headers.etag ?? null,
  url: mockPreferences.url,
});

describe('RemoteConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferences.enabled = true;
    mockPreferences.url = 'https://config.example.test/freekiosk.json';
    mockPreferences.allowInsecureHttp = false;
    mockPreferences.checkIntervalMinutes = 60;
    mockState = initialState();

    mockGetPreferences.mockImplementation(async () => ({ ...mockPreferences }));
    mockGetState.mockImplementation(async () => ({ ...mockState }));
    mockSaveState.mockImplementation(async state => {
      mockState = { ...state };
    });
    mockAsyncStorage.multiGet.mockResolvedValue([]);
    mockAsyncStorage.multiSet.mockResolvedValue(undefined);
    mockAsyncStorage.multiRemove.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue('test-token');
    mockApplyRuntimeSideEffects.mockResolvedValue(undefined);
  });

  it('requires HTTPS unless insecure HTTP is explicitly enabled', () => {
    expect(validateRemoteConfigUrl('https://example.test/config.json', false)).toBeNull();
    expect(validateRemoteConfigUrl('http://example.test/config.json', false)).toContain(
      'HTTP is disabled',
    );
    expect(validateRemoteConfigUrl('http://example.test/config.json', true)).toBeNull();
    expect(validateRemoteConfigUrl('file:///config.json', true)).toContain(
      'Only HTTPS and HTTP',
    );
    expect(validateRemoteConfigUrl('https://user:secret@example.test/config.json', false)).toContain(
      'Credentials in the URL',
    );
  });

  it('filters protected and unknown keys from an exported backup', () => {
    const parsed = parseRemoteConfigDocument(JSON.stringify({
      version: '1.0',
      revision: 42,
      settings: {
        '@kiosk_url': 'https://display.example.test',
        '@kiosk_pin': '1234',
        '@kiosk_rest_api_key': 'do-not-import',
        '@future_setting': 'ignored',
      },
    }));

    expect(parsed.entries).toEqual([['@kiosk_url', 'https://display.example.test']]);
    expect(parsed.ignoredKeys).toEqual([
      '@kiosk_pin',
      '@kiosk_rest_api_key',
      '@future_setting',
    ]);
    expect(parsed.revision).toBe('42');
    expect(parsed.contentHash).toBe(calculateRemoteConfigHash(parsed.entries));
  });

  it('rejects malformed envelopes and invalid serialized values', () => {
    expect(() => parseRemoteConfigDocument('{broken')).toThrow('Invalid JSON');
    expect(() => parseRemoteConfigDocument(JSON.stringify({ version: '2.0', settings: {} })))
      .toThrow('Unsupported remote configuration version');
    expect(() => parseRemoteConfigDocument(JSON.stringify({
      version: '1.0',
      settings: { '@kiosk_auto_reload': true },
    }))).toThrow('must be an AsyncStorage string value');
    expect(() => parseRemoteConfigDocument(JSON.stringify({
      version: '1.0',
      settings: { '@kiosk_auto_reload': 'banana' },
    }))).toThrow('must be "true" or "false"');
  });

  it('downloads, authenticates and atomically applies settings with sync state', async () => {
    const body = JSON.stringify({
      version: '1.0',
      revision: 'rev-7',
      settings: {
        '@kiosk_url': 'https://new.example.test',
        '@kiosk_auto_reload': 'true',
      },
    });
    mockFetchRemoteConfig.mockResolvedValue(makeResponse(200, body, { etag: '"etag-7"' }));
    mockAsyncStorage.multiGet.mockResolvedValue([
      ['@kiosk_url', 'https://old.example.test'],
      ['@kiosk_auto_reload', 'false'],
    ]);

    const result = await syncRemoteConfig({ trigger: 'manual', force: true });

    expect(result.status).toBe('applied');
    expect(result.changedKeys).toEqual(['@kiosk_url', '@kiosk_auto_reload']);
    const writes = mockAsyncStorage.multiSet.mock.calls[0][0];
    expect(writes).toEqual(expect.arrayContaining([
      ['@kiosk_url', 'https://new.example.test'],
      ['@kiosk_auto_reload', 'true'],
    ]));
    const stateWrite = writes.find(([key]) => key === '@kiosk_remote_config_state');
    expect(stateWrite).toBeDefined();
    expect(JSON.parse(stateWrite?.[1] ?? '{}')).toEqual(expect.objectContaining({
      sourceUrl: mockPreferences.url,
      lastResult: 'success',
      etag: '"etag-7"',
      revision: 'rev-7',
    }));
    expect(mockFetchRemoteConfig).toHaveBeenCalledWith({
      url: mockPreferences.url,
      token: 'test-token',
      etag: null,
      allowInsecureHttp: false,
    });
    expect(mockGetToken).toHaveBeenCalledWith(mockPreferences.url);
    expect(mockApplyRuntimeSideEffects).toHaveBeenCalledWith([
      '@kiosk_url',
      '@kiosk_auto_reload',
    ]);
  });

  it('manual force restores local drift even when the remembered hash is unchanged', async () => {
    const entries: [string, string][] = [['@kiosk_url', 'https://same.example.test']];
    mockState.sourceUrl = mockPreferences.url;
    mockState.contentHash = calculateRemoteConfigHash(entries);
    const body = JSON.stringify({
      version: '1.0',
      settings: Object.fromEntries(entries),
    });
    mockFetchRemoteConfig.mockResolvedValue(makeResponse(200, body));
    mockAsyncStorage.multiGet.mockResolvedValue([
      ['@kiosk_url', 'https://locally-changed.example.test'],
    ]);

    const result = await syncRemoteConfig({ trigger: 'foreground', force: true });

    expect(result.status).toBe('applied');
    expect(mockAsyncStorage.multiSet.mock.calls[0][0]).toEqual(expect.arrayContaining(entries));
    expect(mockFetchRemoteConfig).toHaveBeenCalledWith(expect.objectContaining({ etag: null }));
  });

  it('does not reuse ETag or cooldown after the source URL changes', async () => {
    mockState.sourceUrl = 'https://old.example.test/config.json';
    mockState.etag = '"old-etag"';
    mockState.lastCheckedAt = new Date().toISOString();
    const body = JSON.stringify({
      version: '1.0',
      settings: { '@kiosk_url': 'https://display.example.test' },
    });
    mockFetchRemoteConfig.mockResolvedValue(makeResponse(200, body));
    mockAsyncStorage.multiGet.mockResolvedValue([
      ['@kiosk_url', 'https://old-display.example.test'],
    ]);

    const result = await syncRemoteConfig({ trigger: 'startup' });

    expect(result.status).toBe('applied');
    expect(mockFetchRemoteConfig).toHaveBeenCalledWith(expect.objectContaining({ etag: null }));
  });

  it('rolls back previous values if the settings-and-state batch fails', async () => {
    const body = JSON.stringify({
      version: '1.0',
      settings: { '@kiosk_url': 'https://new.example.test' },
    });
    mockFetchRemoteConfig.mockResolvedValue(makeResponse(200, body));
    mockAsyncStorage.multiGet.mockResolvedValue([
      ['@kiosk_url', 'https://old.example.test'],
    ]);
    mockAsyncStorage.multiSet
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);

    const result = await syncRemoteConfig({ trigger: 'manual', force: true });

    expect(result.status).toBe('error');
    expect(result.message).toBe('write failed');
    expect(mockAsyncStorage.multiSet).toHaveBeenNthCalledWith(
      2,
      [['@kiosk_url', 'https://old.example.test']],
    );
    expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
      '@kiosk_remote_config_state',
    ]);
    expect(mockSaveState).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastResult: 'error' }),
    );
  });

  it('uses ETag for automatic checks and handles a 304 response', async () => {
    mockState.sourceUrl = mockPreferences.url;
    mockState.etag = '"cached"';
    mockFetchRemoteConfig.mockResolvedValue(makeResponse(304, ''));

    const result = await syncRemoteConfig({ trigger: 'foreground', force: false });

    expect(result.status).toBe('unchanged');
    expect(mockFetchRemoteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ etag: '"cached"' }),
    );
    expect(mockSaveState).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastResult: 'not_modified' }),
    );
  });

  it('queues a forced check behind an in-flight automatic check', async () => {
    const body = JSON.stringify({
      version: '1.0',
      settings: { '@kiosk_url': 'https://display.example.test' },
    });
    let resolveFirst!: (value: ReturnType<typeof makeResponse>) => void;
    const firstResponse = new Promise<ReturnType<typeof makeResponse>>(resolve => {
      resolveFirst = resolve;
    });
    mockFetchRemoteConfig
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(makeResponse(200, body));
    mockAsyncStorage.multiGet.mockResolvedValue([
      ['@kiosk_url', 'https://display.example.test'],
    ]);

    const automatic = syncRemoteConfig({ trigger: 'interval' });
    const forced = syncRemoteConfig({ trigger: 'manual', force: true });
    resolveFirst(makeResponse(200, body));
    await Promise.all([automatic, forced]);

    expect(mockFetchRemoteConfig).toHaveBeenCalledTimes(2);
    expect(mockFetchRemoteConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ etag: null }),
    );
  });

  it('persists URL validation failures for the settings status panel', async () => {
    mockPreferences.url = 'http://config.example.test/freekiosk.json';

    const result = await syncRemoteConfig({ trigger: 'manual', force: true });

    expect(result.status).toBe('error');
    expect(mockFetchRemoteConfig).not.toHaveBeenCalled();
    expect(mockSaveState).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: mockPreferences.url,
      lastResult: 'error',
      lastCheckedAt: expect.any(String),
    }));
  });
});
