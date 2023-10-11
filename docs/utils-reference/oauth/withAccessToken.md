# `withAccessToken`

Higher-order component fetching an authorization token to then access it. This makes it easier to handle OAuth in your different commands/components.

## Signature

```tsx
function withAccessToken<T>(
  options: {
    authorize: () => Promise<string>;
    personalAccessToken?: string;
  }
): (Component: React.ComponentType<T>) => React.ComponentType<T>;
```

### Arguments

`options` is an object containing:
- `options.authorize` is a promise that initiates the OAuth token retrieval process and resolves to a token string.
- `options.personalAccessToken` is an optional string that represents an already obtained personal access token. When `options.personalAccessToken` is provided, it uses that token. Otherwise, it calls `options.authorize` to fetch an OAuth token asynchronously.

### Return

Returns the wrapped component. 

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

## `getAccessToken`

Utility function designed for retrieving authorization tokens within a component. It ensures that your React components have the necessary authentication state, either through OAuth or a personal access token.

{% hint style="info" %}
`getAccessToken` **must** be used within components that are nested inside a component wrapped with `withAccessToken`.
{% endhint %}

### Signature

```tsx
function getAccessToken(): {
  token: string;
  type: "oauth" | "personal";
}
```

#### Return

The function returns an object containing the following properties:
- `token`: A string representing the access token.
- `type`: An optional string that indicates the type of token retrieved. It can either be `oauth` for OAuth tokens or `personal` for personal access tokens.

### Example

```tsx
import { Detail } from "@raycast/api";
import { authorize } from "./oauth"

function AuthorizedComponent() {
  const { token } = getAccessToken();
  return <Detail markdown={`Access token: ${token}`} />;
}

export default withAccessToken({ authorize })(AuthorizedComponent);
```