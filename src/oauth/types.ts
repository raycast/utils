import { OAuth } from "@raycast/api";

export type OAuthType = "oauth" | "personal";

export type OnAuthorizeParams = {
  type: OAuthType;
  token: string;
  idToken?: string;
};

export interface OAuthServiceOptions {
  client: OAuth.PKCEClient;
  clientId: string;
  scope: string | string[];
  authorizeUrl: string;
  tokenUrl: string;
  refreshTokenUrl?: string;
  personalAccessToken?: string;
  bodyEncoding?: "json" | "url-encoded";
  extraParameters?: Record<string, string>;
  onAuthorize?: (params: OnAuthorizeParams) => void;
  tokenResponseParser?: (response: unknown) => OAuth.TokenResponse;
  tokenRefreshResponseParser?: (response: unknown) => OAuth.TokenResponse;
}

type BaseProviderOptions = {
  scope: string;
  personalAccessToken?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  refreshTokenUrl?: string;
  onAuthorize?: (params: OnAuthorizeParams) => void;
  bodyEncoding?: "json" | "url-encoded";
  tokenResponseParser?: (response: unknown) => OAuth.TokenResponse;
  tokenRefreshResponseParser?: (response: unknown) => OAuth.TokenResponse;
};

export type ProviderWithDefaultClientOptions = BaseProviderOptions & { clientId?: string };

export type ProviderOptions = BaseProviderOptions & { clientId: string };
