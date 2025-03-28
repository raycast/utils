import React from "react";
import { environment, OAuth } from "@raycast/api";
import type { OAuthType, OnAuthorizeParams } from "./types";

let token: string | null = null;
let type: OAuthType | null = null;
let authorize: Promise<string> | null = null;
let getIdToken: Promise<string | undefined> | null = null;
let onAuthorize: Promise<void> | null = null;

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
 * Higher-order component to wrap a given component or function and set an access token in a shared global variable.
 *
 * The function intercepts the component rendering process to either fetch an OAuth token asynchronously
 * or use a provided personal access token. A global variable will be then set with the received token
 * that you can get with the `getAccessToken` function.
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
  if (environment.commandMode === "no-view") {
    return (fn: (props: T) => Promise<void> | (() => void)) => {
      const noViewFn = async (props: T) => {
        if (!token) {
          token = options.personalAccessToken ?? (await options.authorize());
          type = options.personalAccessToken ? "personal" : "oauth";
          const idToken = (await options.client?.getTokens())?.idToken;

          if (options.onAuthorize) {
            await Promise.resolve(options.onAuthorize({ token, type, idToken }));
          }
        }

        return fn(props);
      };

      return noViewFn;
    };
  }

  return (Component: React.ComponentType<T>) => {
    const WrappedComponent: React.ComponentType<T> = (props) => {
      if (options.personalAccessToken) {
        token = options.personalAccessToken;
        type = "personal";
      } else {
        if (!authorize) {
          authorize = options.authorize();
        }
        token = React.use(authorize);
        type = "oauth";
      }

      let idToken: string | undefined;
      if (options.client) {
        if (!getIdToken) {
          getIdToken = options.client?.getTokens().then((tokens) => tokens?.idToken);
        }
        idToken = React.use(getIdToken);
      }

      if (options.onAuthorize) {
        if (!onAuthorize) {
          onAuthorize = Promise.resolve(options.onAuthorize({ token: token!, type, idToken }));
        }
        React.use(onAuthorize);
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore too complicated for TS
      return <Component {...props} />;
    };

    WrappedComponent.displayName = `withAccessToken(${Component.displayName || Component.name})`;

    return WrappedComponent;
  };
}

/**
 * Returns the access token and its type. Note that this function must be called in a component wrapped with `withAccessToken`.
 *
 * Will throw an Error if called outside of a function or component wrapped with `withAccessToken`
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
  if (!token || !type) {
    throw new Error("getAccessToken must be used when authenticated (eg. used inside `withAccessToken`)");
  }

  return { token, type };
}
