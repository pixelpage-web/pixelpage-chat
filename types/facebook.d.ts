/** Tipagem mínima do SDK do Facebook usada pelo Embedded Signup. */

interface FacebookAuthResponse {
  code?: string;
  accessToken?: string;
}

interface FacebookLoginResponse {
  authResponse: FacebookAuthResponse | null;
  status?: string;
}

interface FacebookLoginOptions {
  config_id: string;
  response_type: string;
  override_default_response_type: boolean;
  extras?: Record<string, unknown>;
}

interface FacebookSDK {
  init(options: {
    appId: string;
    autoLogAppEvents?: boolean;
    xfbml?: boolean;
    version: string;
  }): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options: FacebookLoginOptions
  ): void;
}

interface Window {
  FB?: FacebookSDK;
  fbAsyncInit?: () => void;
}
