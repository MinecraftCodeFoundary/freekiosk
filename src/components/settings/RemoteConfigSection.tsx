/**
 * FreeKiosk - RemoteConfigSection
 * Configure and manually trigger URL-based configuration synchronization.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import { StorageService } from '../../utils/storage';
import {
  clearSecureRemoteConfigToken,
  getSecureRemoteConfigToken,
  saveSecureRemoteConfigToken,
} from '../../utils/secureStorage';
import {
  syncRemoteConfig,
  validateRemoteConfigUrl,
} from '../../utils/RemoteConfigService';
import {
  DEFAULT_REMOTE_CONFIG_PREFERENCES,
  DEFAULT_REMOTE_CONFIG_STATE,
  RemoteConfigState,
} from '../../types/remoteConfig';
import SettingsButton from './SettingsButton';
import SettingsInfoBox from './SettingsInfoBox';
import SettingsInput from './SettingsInput';
import SettingsSection from './SettingsSection';
import SettingsSwitch from './SettingsSwitch';

interface RemoteConfigSectionProps {
  onApplyComplete?: () => void | Promise<void>;
}

const MIN_CHECK_INTERVAL_MINUTES = 1;
const MAX_CHECK_INTERVAL_MINUTES = 1440;

const RemoteConfigSection: React.FC<RemoteConfigSectionProps> = ({ onApplyComplete }) => {
  const [enabled, setEnabled] = useState(DEFAULT_REMOTE_CONFIG_PREFERENCES.enabled);
  const [url, setUrl] = useState(DEFAULT_REMOTE_CONFIG_PREFERENCES.url);
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(
    DEFAULT_REMOTE_CONFIG_PREFERENCES.allowInsecureHttp,
  );
  const [checkIntervalMinutes, setCheckIntervalMinutes] = useState(
    String(DEFAULT_REMOTE_CONFIG_PREFERENCES.checkIntervalMinutes),
  );
  const [savedUrl, setSavedUrl] = useState(DEFAULT_REMOTE_CONFIG_PREFERENCES.url);
  const [tokenDraft, setTokenDraft] = useState('');
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [remoteState, setRemoteState] = useState<RemoteConfigState>(DEFAULT_REMOTE_CONFIG_STATE);
  const [urlError, setUrlError] = useState<string | undefined>();
  const [intervalError, setIntervalError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadRemoteConfigSettings = useCallback(async () => {
    try {
      const [preferences, state] = await Promise.all([
        StorageService.getRemoteConfigPreferences(),
        StorageService.getRemoteConfigState(),
      ]);
      const storedToken = await getSecureRemoteConfigToken(preferences.url);

      setEnabled(preferences.enabled);
      setUrl(preferences.url);
      setSavedUrl(preferences.url);
      setAllowInsecureHttp(preferences.allowInsecureHttp);
      setCheckIntervalMinutes(String(preferences.checkIntervalMinutes));
      setRemoteState(state);
      setHasStoredToken(storedToken.length > 0);
      setTokenDraft('');
    } catch (error) {
      Alert.alert('Remote Configuration', `Unable to load settings: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRemoteConfigSettings();
  }, [loadRemoteConfigSettings]);

  const validateDraft = (): { normalizedUrl: string; interval: number } | null => {
    const normalizedUrl = url.trim();
    const validationError = normalizedUrl
      ? validateRemoteConfigUrl(normalizedUrl, allowInsecureHttp)
      : 'Configuration URL is required.';
    setUrlError(validationError || undefined);

    const interval = Number.parseInt(checkIntervalMinutes, 10);
    const invalidInterval =
      !Number.isInteger(interval) ||
      interval < MIN_CHECK_INTERVAL_MINUTES ||
      interval > MAX_CHECK_INTERVAL_MINUTES;
    setIntervalError(
      invalidInterval
        ? `Enter a value from ${MIN_CHECK_INTERVAL_MINUTES} to ${MAX_CHECK_INTERVAL_MINUTES} minutes.`
        : undefined,
    );

    if (validationError || invalidInterval) return null;
    if (tokenDraft.includes('\r') || tokenDraft.includes('\n')) {
      Alert.alert('Invalid Token', 'Bearer token must not contain line breaks.');
      return null;
    }
    if (tokenDraft.length > 0 && !tokenDraft.trim()) {
      Alert.alert('Invalid Token', 'Use Clear Saved Token to remove the current token.');
      return null;
    }
    return { normalizedUrl, interval };
  };

  const getOrigin = (value: string): string | null => {
    try {
      return (new URL(value) as unknown as { origin: string }).origin;
    } catch {
      return null;
    }
  };

  const saveSource = async (showConfirmation: boolean): Promise<boolean> => {
    const validated = validateDraft();
    if (!validated) return false;

    setSaving(true);
    try {
      const previousPreferences = await StorageService.getRemoteConfigPreferences();
      await StorageService.saveRemoteConfigPreferences({
        enabled,
        url: validated.normalizedUrl,
        allowInsecureHttp,
        checkIntervalMinutes: validated.interval,
      });

      const normalizedToken = tokenDraft.trim();
      try {
        if (normalizedToken) {
          const tokenSaved = await saveSecureRemoteConfigToken(
            normalizedToken,
            validated.normalizedUrl,
          );
          if (!tokenSaved) throw new Error('Bearer token could not be saved securely.');
        } else if (
          hasStoredToken &&
          getOrigin(savedUrl) !== getOrigin(validated.normalizedUrl)
        ) {
          // Never carry credentials to a different origin implicitly.
          await clearSecureRemoteConfigToken();
        }
      } catch (tokenError) {
        await StorageService.saveRemoteConfigPreferences(previousPreferences);
        throw tokenError;
      }

      setUrl(validated.normalizedUrl);
      setSavedUrl(validated.normalizedUrl);
      setCheckIntervalMinutes(String(validated.interval));
      setTokenDraft('');
      setHasStoredToken(
        (await getSecureRemoteConfigToken(validated.normalizedUrl)).length > 0,
      );

      if (showConfirmation) {
        Alert.alert('Remote Configuration', 'Remote configuration source saved.');
      }
      return true;
    } catch (error) {
      Alert.alert('Save Failed', error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCheckNow = async () => {
    const saved = await saveSource(false);
    if (!saved) return;

    setChecking(true);
    try {
      const result = await syncRemoteConfig({
        trigger: 'manual',
        force: true,
        ignoreDisabled: true,
      });
      setRemoteState(await StorageService.getRemoteConfigState());

      if (result.applied) await onApplyComplete?.();

      const ignoredNote = result.ignoredKeys.length > 0
        ? `\n\nIgnored ${result.ignoredKeys.length} protected or unknown setting(s).`
        : '';
      Alert.alert(
        result.applied ? 'Configuration Applied' : 'Remote Configuration',
        `${result.message}${ignoredNote}`,
      );
    } catch (error) {
      try {
        setRemoteState(await StorageService.getRemoteConfigState());
      } catch {
        // Keep the last state already shown in the UI.
      }
      Alert.alert('Sync Failed', error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  };

  const handleClearToken = () => {
    Alert.alert(
      'Clear Bearer Token',
      'Remove the saved bearer token from secure storage?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearSecureRemoteConfigToken();
            setTokenDraft('');
            setHasStoredToken(false);
          },
        },
      ],
    );
  };

  const formatTimestamp = (value: string | null): string => {
    if (!value) return 'Never';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  };

  const getStatusVariant = (): 'info' | 'success' | 'error' => {
    if (remoteState.lastResult === 'error') return 'error';
    if (remoteState.lastResult === 'success' || remoteState.lastResult === 'not_modified') {
      return 'success';
    }
    return 'info';
  };

  return (
    <SettingsSection title="Remote Configuration" icon="sync">
      <SettingsInfoBox variant="info">
        Download configuration from a centrally managed JSON URL. HTTPS is recommended because
        remote configuration can change kiosk behavior.
      </SettingsInfoBox>

      <SettingsSwitch
        label="Enable Remote Configuration"
        hint="Check automatically while FreeKiosk is running and when it returns to the foreground"
        value={enabled}
        onValueChange={setEnabled}
        disabled={loading || saving || checking}
      />

      <SettingsInput
        label="Configuration URL"
        value={url}
        onChangeText={(value) => {
          setUrl(value);
          if (urlError) setUrlError(undefined);
        }}
        placeholder="https://example.com/freekiosk-config.json"
        keyboardType="url"
        icon="link-variant"
        hint="Direct URL to a FreeKiosk backup-format JSON file"
        error={urlError}
        disabled={loading || saving || checking}
      />

      <SettingsInput
        label="Bearer Token (optional)"
        value={tokenDraft}
        onChangeText={setTokenDraft}
        placeholder={hasStoredToken ? 'Saved securely — enter a new token to replace it' : 'Optional bearer token'}
        secureTextEntry
        icon="key-variant"
        maxLength={4096}
        hint={hasStoredToken ? 'A token is stored securely in Android Keychain.' : 'Sent using the Authorization: Bearer header'}
        disabled={loading || saving || checking}
      />

      {hasStoredToken && (
        <SettingsButton
          title="Clear Saved Token"
          icon="delete-outline"
          variant="outline"
          size="small"
          onPress={handleClearToken}
          disabled={saving || checking}
        />
      )}

      <SettingsInput
        label="Check Interval (minutes)"
        value={checkIntervalMinutes}
        onChangeText={(value) => {
          if (/^\d*$/.test(value)) setCheckIntervalMinutes(value);
          if (intervalError) setIntervalError(undefined);
        }}
        placeholder="60"
        keyboardType="numeric"
        icon="timer"
        hint="1 to 1440 minutes; checks also run on startup and foreground return"
        error={intervalError}
        disabled={loading || saving || checking}
      />

      <SettingsSwitch
        label="Allow Insecure HTTP"
        hint="Permit an unencrypted HTTP source (not recommended)"
        value={allowInsecureHttp}
        onValueChange={setAllowInsecureHttp}
        disabled={loading || saving || checking}
      />

      {allowInsecureHttp && (
        <SettingsInfoBox variant="warning" title="Security warning">
          HTTP allows anyone on the network path to read or replace the configuration and capture
          its Bearer token. Use HTTPS whenever possible.
        </SettingsInfoBox>
      )}

      <View style={styles.actions}>
        <SettingsButton
          title="Save Source"
          icon="check"
          variant="outline"
          onPress={() => saveSource(true)}
          loading={saving}
          disabled={loading || checking}
        />
        <SettingsButton
          title="Check Now"
          icon="refresh"
          onPress={handleCheckNow}
          loading={checking}
          disabled={loading || saving}
        />
      </View>

      <SettingsInfoBox variant={getStatusVariant()} title="Last Sync Status">
        <Text style={styles.statusText}>Status: {remoteState.lastResult.replace('_', ' ')}</Text>
        <Text style={styles.statusText}>Last checked: {formatTimestamp(remoteState.lastCheckedAt)}</Text>
        <Text style={styles.statusText}>Last applied: {formatTimestamp(remoteState.lastAppliedAt)}</Text>
        {remoteState.revision && <Text style={styles.statusText}>Revision: {remoteState.revision}</Text>}
        {remoteState.lastMessage ? <Text style={styles.statusMessage}>{remoteState.lastMessage}</Text> : null}
      </SettingsInfoBox>
    </SettingsSection>
  );
};

const styles = StyleSheet.create({
  actions: {
    marginTop: Spacing.sm,
  },
  statusText: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  statusMessage: {
    ...Typography.hint,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});

export default RemoteConfigSection;
