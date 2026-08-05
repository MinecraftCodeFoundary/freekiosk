/**
 * FreeKiosk - Remote Configuration Types
 * Persistent preferences and synchronization metadata for URL-based config updates.
 */

export type RemoteConfigResult = 'never' | 'success' | 'not_modified' | 'error';

export interface RemoteConfigPreferences {
  enabled: boolean;
  url: string;
  allowInsecureHttp: boolean;
  checkIntervalMinutes: number;
}

export interface RemoteConfigState {
  sourceUrl: string | null;
  lastCheckedAt: string | null;
  lastAppliedAt: string | null;
  lastResult: RemoteConfigResult;
  lastMessage: string;
  etag: string | null;
  revision: string | null;
  contentHash: string | null;
}

export const DEFAULT_REMOTE_CONFIG_PREFERENCES: RemoteConfigPreferences = {
  enabled: false,
  url: '',
  allowInsecureHttp: false,
  checkIntervalMinutes: 60,
};

export const DEFAULT_REMOTE_CONFIG_STATE: RemoteConfigState = {
  sourceUrl: null,
  lastCheckedAt: null,
  lastAppliedAt: null,
  lastResult: 'never',
  lastMessage: '',
  etag: null,
  revision: null,
  contentHash: null,
};
