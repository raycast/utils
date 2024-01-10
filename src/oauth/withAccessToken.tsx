import React, { useRef } from "react";
import { environment, OAuth } from "@raycast/api";

export type OnAuthorizeParams = {
  type: OAuthType;
  token: string;
  idToken?: string;
};

type OAuthType = "oauth" | "personal";

let token: string | null = null;
let type: OAuthType | null = null;
let authorize: { read(): string } | null = null;

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
 * @param {object} options - Configuration options for the token retrieval.
 * @param {() => Promise<string>} options.authorize - A function to retrieve an OAuth token.
 * @param {string} options.personalAccessToken - An optional personal access token.
 * @returns {React.ComponentType<T>} The wrapped component.
 */
export function withAccessToken<T>(
  options: WithAccessTokenParameters,
): <U extends (() => Promise<void> | void) | React.ComponentType<T>>(
  fnOrComponent: U,
) => U extends () => Promise<void> | void ? Promise<void> : React.FunctionComponent<T>;
export function withAccessToken<T>(options: WithAccessTokenParameters) {
  if (environment.commandMode === "no-view") {
    return async (fn: () => Promise<void> | (() => void)) => {
      if (!token) {
        token = options.personalAccessToken ?? (await options.authorize());
        type = options.personalAccessToken ? "personal" : "oauth";
        const idToken = (await options.client?.getTokens())?.idToken;

        if (options.onAuthorize) {
          options.onAuthorize({ token, type, idToken });
        }
      }
      return fn();
    };
  }

  return (Component: React.ComponentType<T>) => {
    const WrappedComponent: React.ComponentType<T> = (props) => {
      const didAuthorized = useRef(false);

      if (options.personalAccessToken) {
        token = options.personalAccessToken;
        type = "personal";
      } else {
        if (!authorize) {
          authorize = wrappedAuthorize(options.authorize());
        }
        token = authorize.read();
        type = "oauth";
      }

      if (!didAuthorized.current) {
        const { client, onAuthorize } = options;
        if (client) {
          client.getTokens().then((tokenSet) => {
            if (onAuthorize && token && type) {
              onAuthorize({ token, type, idToken: tokenSet?.idToken });
            }
          });
        } else if (onAuthorize && token) {
          onAuthorize({ token, type });
        }
        didAuthorized.current = true;
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
 * @throws {Error} If called outside of a component wrapped with `withAccessToken`
 * @returns {{ token: string, type: "oauth" | "personal" }} An object containing the `token`
 * and its `type`, where type can be either 'oauth' for OAuth tokens or 'personal' for a
 * personal access token.
 */
export function getAccessToken() {
  if (!token || !type) {
    throw new Error("getAccessToken must be used when authenticated (eg. used inside `withAccessToken`)");
  }

  return { token, type };
}

function wrappedAuthorize(promise: Promise<string>): { read(): string } {
  let status = "pending";
  let response: string;

  const suspender = promise.then(
    (res) => {
      status = "success";
      response = res;
    },
    (err) => {
      status = "error";
      response = err;
    },
  );

  const read = () => {
    switch (status) {
      case "pending":
        throw suspender;
      case "error":
        throw response;
      default:
        return response;
    }
  };

  return { read };
}
