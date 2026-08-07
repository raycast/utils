import React from "react";
import { environment, OAuth } from "@raycast/api";
import type { OAuthType, OnAuthorizeParams } from "./types";

type AccessToken = { token: string; type: OAuthType };
let accessToken: AccessToken | undefined;

let accessTokenPromise: Promise<AccessToken> | null = null;
let idTokenPromise: Promise<string | undefined> | null = null;
let onAuthorizePromise: Promise<void> | null = null;

type WithAccessTokenParameters = {
  /**
   * An optional instance of a PKCE Client that you can create using Raycast API.
   * This client is used to return the `idToken` as part of the `onAuthorize` callback.
   */
  client?: OAuth.PKCEClient;
  /**
   * A function that initiates the OAuth token retrieval process
   * @returns a promise that resolves to an access token.
   */
  authorize: () => Promise<string>;
  /**
   * An optional string that represents an already obtained personal access token
   */
  personalAccessToken?: string;
  /**
   * An optional callback function that is called once the user has been properly logged in through OAuth.
   * @param {object} params - Parameters of the callback
   * @param {string} options.token - The retrieved access token
   * @param {string} options.type - The access token's type (either `oauth` or `personal`)
   * @param {string} options.idToken - The optional id token. The `idToken` is returned if `options.client` is provided and if it's returned in the initial token set.
   */
  onAuthorize?: (params: OnAuthorizeParams) => void;
};

/**
 * The component (for a view/menu-bar commands) or function (for a no-view command) that is passed to withAccessToken.
 */
export type WithAccessTokenComponentOrFn<T = any, U = any> = ((params: T) => Promise<U> | U) | React.ComponentType<T>;

/**
 * Higher-order component to wrap a given component or function and make an access token available to its descendants.
 *
 * The function intercepts the component rendering process to either fetch an OAuth token asynchronously
 * or use a provided personal access token. The received token can be read with the `getAccessToken` function.
 *
 * @example
 * ```typescript
 * import { Detail } from "@raycast/api";
 * import { OAuthService, getAccessToken, withAccessToken } from "@raycast/utils";
 *
 * const github = OAuthService.github({ scope: "notifications repo read:org read:user read:project" });
 *
 * function AuthorizedComponent() {
 *  const { token } = getAccessToken();
 *  ...
 * }
 *
 * export default withAccessToken(github)(AuthorizedComponent);
 * ```
 *
 * @returns {React.ComponentType<T>} The wrapped component.
 */
export function withAccessToken<T = any, U = any>(
  options: WithAccessTokenParameters,
): <V extends WithAccessTokenComponentOrFn<T, U>>(
  fnOrComponent: V,
) => V extends React.ComponentType<T> ? React.FunctionComponent<T> : (props: T) => Promise<U>;
export function withAccessToken<T>(options: WithAccessTokenParameters) {
  const personalAccessToken: AccessToken | undefined = options.personalAccessToken
    ? { token: options.personalAccessToken, type: "personal" }
    : undefined;

  const authorize = () => {
    accessTokenPromise ??= (
      personalAccessToken
        ? Promise.resolve(personalAccessToken)
        : options.authorize().then((token) => ({ token, type: "oauth" as const }))
    ).catch((error) => {
      accessTokenPromise = null;
      throw error;
    });
    return accessTokenPromise;
  };

  const getIdToken = () => {
    if (!options.client) {
      return undefined;
    }
    idTokenPromise ??= options.client.getTokens().then(
      (tokens) => tokens?.idToken,
      (error) => {
        idTokenPromise = null;
        throw error;
      },
    );
    return React.use(idTokenPromise);
  };

  const runOnAuthorize = (accessToken: AccessToken, idToken?: string) => {
    if (!options.onAuthorize) {
      return;
    }
    onAuthorizePromise ??= Promise.resolve(options.onAuthorize({ ...accessToken, idToken })).catch((error) => {
      onAuthorizePromise = null;
      throw error;
    });
    return onAuthorizePromise;
  };

  if (environment.commandMode === "no-view") {
    return (fn: (props: T) => Promise<void> | (() => void)) => {
      const noViewFn = async (props: T) => {
        accessToken = await authorize();
        const idToken = (await options.client?.getTokens())?.idToken;
        await runOnAuthorize(accessToken, idToken);
        return fn(props);
      };

      return noViewFn;
    };
  }

  return (Component: React.ComponentType<T>) => {
    const WrappedComponent: React.ComponentType<T> = (props) => {
      accessToken = personalAccessToken || React.use(authorize());
      const idToken = getIdToken();
      const onAuthorize = runOnAuthorize(accessToken, idToken);
      if (onAuthorize) {
        React.use(onAuthorize);
      }

      return React.createElement(Component as React.ComponentType<any>, props);
    };

    WrappedComponent.displayName = `withAccessToken(${Component.displayName || Component.name})`;

    return WrappedComponent;
  };
}

/**
 * Returns the access token and its type for the command authenticated by `withAccessToken`.
 *
 * This is a plain synchronous function, so it can be called from the wrapped command's helpers and callbacks as well
 * as during component rendering. It throws if the command has not been authenticated yet.
 *
 * @returns {{ token: string, type: "oauth" | "personal" }} An object containing the `token`
 * and its `type`, where type can be either 'oauth' for OAuth tokens or 'personal' for a
 * personal access token.
 */
export function getAccessToken(): {
  token: string;
  /** `oauth` for OAuth tokens or `personal` for personal access token */
  type: "oauth" | "personal";
} {
  if (!accessToken) {
    throw new Error("getAccessToken must be used when authenticated (eg. used inside `withAccessToken`)");
  }

  return accessToken;
}
