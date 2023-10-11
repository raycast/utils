# `withAccessToken`

Higher-order component fetching an authorization token to then access it. This makes it easier to handle OAuth in your different commands/components. This function will work for all Raycast commands, whether it's `view`, `no-view`, `menu-bar`.

## Signature

```tsx
function withAccessToken<T>(
  options: WithAccessTokenParameters,
): <U extends (() => Promise<void> | void) | React.ComponentType<T>>(
  fnOrComponent: U,
) => U extends () => Promise<void> | void ? Promise<void> : React.FunctionComponent<T>;
```

### Arguments

`options` is an object containing:
- `options.client` is an instance of a PKCE Client that you can create using Raycast API.
- `options.authorize` is a promise that initiates the OAuth token retrieval process and resolves to a token string.
- `options.personalAccessToken` is an optional string that represents an already obtained personal access token. When `options.personalAccessToken` is provided, it uses that token. Otherwise, it calls `options.authorize` to fetch an OAuth token asynchronously.
- `options.onAuthorize` is a callback function that is called with the `token`, its `type`, and its `idToken` once the user has been properly logged in through OAuth.

### Return

Returns the wrapped component if used in a `view` command or the wrapped function if used in a `no-view` command.

{% hint style="info" %}
Note that the access token isn't injected into the wrapped component props. Instead, it's been set as a global variable that you can get with `getAccessToken`.
{% endhint %}

## Example

```tsx
import { Detail } from "@raycast/api";
import { withAccessToken } from "@raycast/utils";
import { authorize } from "./oauth"

function AuthorizedComponent(props) {
  return <List ... />;
}

export default withAccessToken({ authorize })(AuthorizedComponent);
```

Note that it also works for `no-view` commands as stated above:

```tsx
import { Detail } from "@raycast/api";
import { withAccessToken } from "@raycast/utils";
import { authorize } from "./oauth"

async function AuthorizedCommand() {
  await showHUD("Authorized");
}

export default withAccessToken({ authorize })(AuthorizedCommand);
```

## Types

### WithAccessTokenParameters

```ts
type OAuthType = "oauth" | "personal";

type OnAuthorizeParams = {
  token: string;
  type: OAuthType;
  idToken: string | null;
};

type WithAccessTokenParameters = {
  client?: OAuth.PKCEClient;
  authorize: () => Promise<string>;
  personalAccessToken?: string;
  onAuthorize?: (params: OnAuthorizeParams) => void;
};
```