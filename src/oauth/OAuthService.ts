import { OAuth } from "@raycast/api";
import {
  asanaService,
  githubService,
  googleService,
  jiraService,
  linearService,
  slackService,
  zoomService,
} from "./providers";
import type { OAuthServiceOptions, OnAuthorizeParams } from "./types";

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
export class OAuthService implements OAuthServiceOptions {
  public clientId: string;
  public scope: string;
  public client: OAuth.PKCEClient;
  public extraParameters?: Record<string, string>;
  public authorizeUrl: string;
  public tokenUrl: string;
  public refreshTokenUrl?: string;
  public bodyEncoding?: "json" | "url-encoded";
  public personalAccessToken?: string;
  onAuthorize?: (params: OnAuthorizeParams) => void;
  tokenResponseParser: (response: unknown) => OAuth.TokenResponse;
  tokenRefreshResponseParser: (response: unknown) => OAuth.TokenResponse;

  constructor(options: OAuthServiceOptions) {
    this.clientId = options.clientId;
    this.scope = Array.isArray(options.scope) ? options.scope.join(" ") : options.scope;
    this.personalAccessToken = options.personalAccessToken;
    this.bodyEncoding = options.bodyEncoding;
    this.client = options.client;
    this.extraParameters = options.extraParameters;
    this.authorizeUrl = options.authorizeUrl;
    this.tokenUrl = options.tokenUrl;
    this.refreshTokenUrl = options.refreshTokenUrl;
    this.onAuthorize = options.onAuthorize;
    this.tokenResponseParser = options.tokenResponseParser ?? ((x) => x as OAuth.TokenResponse);
    this.tokenRefreshResponseParser = options.tokenRefreshResponseParser ?? ((x) => x as OAuth.TokenResponse);
    this.authorize = this.authorize.bind(this);
  }

  /**
   * Asana OAuth service provided out of the box.
   *
   * @example
   * ```typescript
   * const asana = OAuthService.asana({ scope: 'default' })
   * ```
   */
  public static asana: typeof asanaService = asanaService;

  /**
   * GitHub OAuth service provided out of the box.
   *
   * @example
   * ```typescript
   * const github = OAuthService.github({ scope: 'repo user' })
   * ```
   */
  public static github: typeof githubService = githubService;

  /**
   * Google OAuth service provided out of the box.
   *
   * @example
   * ```typescript
   * const google = OAuthService.google({
   *   clientId: 'custom-client-id',
   *   authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
   *   tokenUrl: 'https://oauth2.googleapis.com/token',
   *   scope: 'https://www.googleapis.com/auth/drive.readonly',
   * });
   * ```
   */
  public static google: typeof googleService = googleService;

  /**
   * Jira OAuth service provided out of the box.
   *
   * @example
   * ```typescript
   * const jira = OAuthService.jira({
   *   clientId: 'custom-client-id',
   *   authorizeUrl: 'https://auth.atlassian.com/authorize',
   *   tokenUrl: 'https://api.atlassian.com/oauth/token',
   *   scope: 'read:jira-user read:jira-work offline_access'
   * });
   * ```
   */
  public static jira: typeof jiraService = jiraService;

  /**
   * Linear OAuth service provided out of the box.
   *
   * @example
   * ```typescript
   * const linear = OAuthService.linear({ scope: 'read write' })
   * ```
   */
  public static linear: typeof linearService = linearService;

  /**
   * Slack OAuth service provided out of the box.
   *
   * @example
   * ```typescript
   * const slack = OAuthService.slack({ scope: 'emoji:read' })
   * ```
   */
  public static slack: typeof slackService = slackService;

  /**
   * Zoom OAuth service provided out of the box.
   *
   * @example
   * ```typescript
   * const zoom = OAuthService.zoom({
   *   clientId: 'custom-client-id',
   *   authorizeUrl: 'https://zoom.us/oauth/authorize',
   *   tokenUrl: 'https://zoom.us/oauth/token',
   *   scope: 'meeting:write',
   *   personalAccessToken: 'personal-access-token',
   * });
   * ```
   */
  public static zoom: typeof zoomService = zoomService;

  /**
   * Initiates the OAuth authorization process or refreshes existing tokens if necessary.
   * If the current token set has a refresh token and it is expired, then the function will refresh the tokens.
   * If no tokens exist, it will initiate the OAuth authorization process and fetch the tokens.
   *
   * @returns {Promise<string>} A promise that resolves with the access token obtained from the authorization flow, or null if the token could not be obtained.
   */
  async authorize() {
    const currentTokenSet = await this.client.getTokens();
    if (currentTokenSet?.accessToken) {
      if (currentTokenSet.refreshToken && currentTokenSet.isExpired()) {
        const tokens = await this.refreshTokens({
          token: currentTokenSet.refreshToken,
        });

        // In the case where the refresh token flows fails, nothing is returned and the authorize function is called again.
        if (tokens) {
          await this.client.setTokens(tokens);
          return tokens.access_token;
        }
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
    });

    await this.client.setTokens(tokens);

    return tokens.access_token;
  }

  private async fetchTokens({
    authRequest,
    authorizationCode,
  }: {
    authRequest: OAuth.AuthorizationRequest;
    authorizationCode: string;
  }) {
    let options;
    if (this.bodyEncoding === "url-encoded") {
      const params = new URLSearchParams();
      params.append("client_id", this.clientId);
      params.append("code", authorizationCode);
      params.append("code_verifier", authRequest.codeVerifier);
      params.append("grant_type", "authorization_code");
      params.append("redirect_uri", authRequest.redirectURI);

      options = { body: params };
    } else {
      options = {
        body: JSON.stringify({
          client_id: this.clientId,
          code: authorizationCode,
          code_verifier: authRequest.codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: authRequest.redirectURI,
        }),
        headers: { "Content-Type": "application/json" },
      };
    }

    const response = await fetch(this.tokenUrl, { method: "POST", ...options });
    if (!response.ok) {
      const responseText = await response.text();
      console.error("fetch tokens error:", responseText);
      throw new Error(`Error while fetching tokens: ${response.status} (${response.statusText})\n${responseText}`);
    }
    const tokens = this.tokenResponseParser(await response.json());

    // Some clients such as Linear can return a scope array instead of a string
    return Array.isArray(tokens.scope) ? { ...tokens, scope: tokens.scope.join(" ") } : tokens;
  }

  private async refreshTokens({ token }: { token: string }) {
    let options;
    if (this.bodyEncoding === "url-encoded") {
      const params = new URLSearchParams();
      params.append("client_id", this.clientId);
      params.append("refresh_token", token);
      params.append("grant_type", "refresh_token");

      options = { body: params };
    } else {
      options = {
        body: JSON.stringify({
          client_id: this.clientId,
          refresh_token: token,
          grant_type: "refresh_token",
        }),
        headers: { "Content-Type": "application/json" },
      };
    }

    const response = await fetch(this.refreshTokenUrl ?? this.tokenUrl, { method: "POST", ...options });
    if (!response.ok) {
      const responseText = await response.text();
      console.error("refresh tokens error:", responseText);
      // If the refresh token is invalid, stop the flow here, log out the user and prompt them to re-authorize.
      this.client.description = `${this.client.providerName} needs you to sign-in again. Press ⏎ or click the button below to continue.`;
      await this.client.removeTokens();
      await this.authorize();
    } else {
      const tokenResponse = this.tokenRefreshResponseParser(await response.json());
      tokenResponse.refresh_token = tokenResponse.refresh_token ?? token;
      return tokenResponse;
    }
  }
}
