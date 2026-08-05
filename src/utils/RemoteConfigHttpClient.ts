/**
 * Android-native HTTP client for remote configuration.
 *
 * Redirect handling lives in Kotlin so Authorization is only copied after the
 * next URL has been verified as same-origin. React Native's global fetch may
 * follow redirects before JavaScript can inspect the destination.
 */
import { NativeModules } from 'react-native';

export interface RemoteConfigHttpRequest {
  url: string;
  token: string;
  etag: string | null;
  allowInsecureHttp: boolean;
}

export interface RemoteConfigHttpResponse {
  status: number;
  body: string;
  etag: string | null;
  url: string;
}

interface RemoteConfigHttpNativeModule {
  fetch(
    url: string,
    token: string,
    etag: string | null,
    allowInsecureHttp: boolean,
  ): Promise<RemoteConfigHttpResponse>;
}

const getNativeModule = (): RemoteConfigHttpNativeModule => {
  const module = NativeModules.RemoteConfigHttpModule as
    | RemoteConfigHttpNativeModule
    | undefined;
  if (!module?.fetch) {
    throw new Error('Remote configuration HTTP module is unavailable.');
  }
  return module;
};

export function fetchRemoteConfig(
  request: RemoteConfigHttpRequest,
): Promise<RemoteConfigHttpResponse> {
  return getNativeModule().fetch(
    request.url,
    request.token,
    request.etag,
    request.allowInsecureHttp,
  );
}
