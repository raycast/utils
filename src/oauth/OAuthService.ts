import { OAuth } from "@raycast/api";
import fetch from "cross-fetch";

interface OAuthServiceInterface {
  client: OAuth.PKCEClient;
  clientId: string;
  scope: string;
  personalAccessToken?: string;
  bodyEncoding?: "json" | "url-encoded";
  extraParameters?: Record<string, string>;
  authorizeUrl: string;
  tokenUrl: string;
  refreshTokenUrl?: string;
  onAuthorize?: ({ token, type }: { token: string; type: "personal" | "oauth" }) => void;
}

type FetchTokensArgs = { authRequest: OAuth.AuthorizationRequest; authorizationCode: string } & Pick<
  OAuthServiceInterface,
  "clientId" | "tokenUrl" | "bodyEncoding"
>;

type RefreshTokensArgs = { token: string } & Pick<OAuthServiceInterface, "clientId" | "tokenUrl" | "bodyEncoding">;

/**
 * Class allowing to create an OAuth service using the the PKCE (Proof Key for Code Exchange) flow.
 *
 * This service is capable of starting the authorization process, fetching and refreshing tokens,
 * as well as managing the authentication state.
 *
 * @example
 * ```typescript
 * const oauthClient = new OAuth.PKCEClient({ ... });
 * const oauthService = new OAuthService({
 *   client: oauthClient,
 *   clientId: 'your-client-id',
 *   scope: 'required scopes',
 *   authorizeUrl: 'https://provider.com/oauth/authorize',
 *   tokenUrl: 'https://provider.com/oauth/token',
 *   refreshTokenUrl: 'https://provider.com/oauth/token',
 *   extraParameters: { 'additional_param': 'value' }
 * });
 * ```
 */
export class OAuthService implements OAuthServiceInterface {
  public clientId: string;
  public scope: string;
  public client: OAuth.PKCEClient;
  public extraParameters?: Record<string, string>;
  public authorizeUrl: string;
  public tokenUrl: string;
  public refreshTokenUrl?: string;
  public bodyEncoding?: "json" | "url-encoded";
  public personalAccessToken?: string;
  onAuthorize?: ({ token, type }: { token: string; type: "personal" | "oauth" }) => void;

  constructor(options: {
    client: OAuth.PKCEClient;
    clientId: string;
    scope: string;
    authorizeUrl: string;
    tokenUrl: string;
    refreshTokenUrl?: string;
    personalAccessToken?: string;
    bodyEncoding?: "json" | "url-encoded";
    extraParameters?: Record<string, string>;
    onAuthorize?: ({ token, type }: { token: string; type: "personal" | "oauth" }) => void;
  }) {
    this.clientId = options.clientId;
    this.scope = options.scope;
    this.personalAccessToken = options.personalAccessToken;
    this.bodyEncoding = options.bodyEncoding;
    this.client = options.client;
    this.extraParameters = options.extraParameters;
    this.authorizeUrl = options.authorizeUrl;
    this.tokenUrl = options.tokenUrl;
    this.refreshTokenUrl = options.refreshTokenUrl;
    this.onAuthorize = options.onAuthorize;
    this.authorize = this.authorize.bind(this);
  }

  public get oauthClient(): OAuth.PKCEClient {
    return this.client;
  }

  async authorize() {
    const currentTokenSet = await this.client.getTokens();
    if (currentTokenSet?.accessToken) {
      if (currentTokenSet.refreshToken && currentTokenSet.isExpired()) {
        await this.client.setTokens(
          await this.refreshTokens({
            token: currentTokenSet.refreshToken,
            clientId: this.clientId,
            tokenUrl: this.refreshTokenUrl ?? this.tokenUrl,
          }),
        );
      }
      return currentTokenSet.accessToken;
    }

    const authRequest = await this.client.authorizationRequest({
      endpoint: this.authorizeUrl,
      clientId: this.clientId,
      scope: this.scope,
      extraParameters: this.extraParameters,
    });

    const { authorizationCode } = await this.client.authorize(authRequest);
    const tokens = await this.fetchTokens({
      authRequest,
      authorizationCode,
      clientId: this.clientId,
      tokenUrl: this.tokenUrl,
    });

    await this.client.setTokens(tokens);

    return tokens.access_token;
  }

  private async fetchTokens({ authRequest, authorizationCode, clientId, tokenUrl, bodyEncoding }: FetchTokensArgs) {
    let options;
    if (bodyEncoding === "url-encoded") {
      const params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("code", authorizationCode);
      params.append("code_verifier", authRequest.codeVerifier);
      params.append("grant_type", "authorization_code");
      params.append("redirect_uri", authRequest.redirectURI);

      options = { body: params };
    } else {
      options = {
        body: JSON.stringify({
          client_id: clientId,
          code: authorizationCode,
          code_verifier: authRequest.codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: authRequest.redirectURI,
        }),
        headers: { "Content-Type": "application/json" },
      };
    }

    const response = await fetch(tokenUrl, { method: "POST", ...options });
    if (!response.ok) {
      const responseText = await response.text();
      console.error("fetch tokens error:", responseText);
      throw new Error(`Error while fetching tokens: ${response.status} (${response.statusText})\n${responseText}`);
    }
    const tokens = (await response.json()) as OAuth.TokenResponse;

    // Some clients such as Linear can return a scope array instead of a string
    return Array.isArray(tokens.scope) ? { ...tokens, scope: tokens.scope.join(" ") } : tokens;
  }

  private async refreshTokens({ token, clientId, tokenUrl, bodyEncoding }: RefreshTokensArgs) {
    let options;
    if (bodyEncoding === "url-encoded") {
      const params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("refresh_token", token);
      params.append("grant_type", "refresh_token");

      options = { body: params };
    } else {
      options = {
        body: JSON.stringify({
          client_id: clientId,
          refresh_token: token,
          grant_type: "refresh_token",
        }),
        headers: { "Content-Type": "application/json" },
      };
    }

    const response = await fetch(tokenUrl, { method: "POST", ...options });
    if (!response.ok) {
      const responseText = await response.text();
      console.error("refresh tokens error:", responseText);
      throw new Error(`Error while refreshing tokens: ${response.status} (${response.statusText})\n${responseText}`);
    }
    const tokenResponse = (await response.json()) as OAuth.TokenResponse;
    tokenResponse.refresh_token = tokenResponse.refresh_token ?? token;
    return tokenResponse;
  }
}
