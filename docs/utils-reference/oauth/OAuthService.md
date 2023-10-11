# `OAuthService`

The `OAuthService` class is designed to abstract the OAuth authorization process using the PKCE (Proof Key for Code Exchange) flow, simplifying the integration with various OAuth providers such as Asana, GitHub, and others.

## Initialization

Construct an instance of a provider-specific `OAuthService` with the required parameters:

- `client`: The PKCE Client defined using `OAuth.PKCEClient` from `@raycast/api`
- `clientId`: The app's client ID.
- `scope`: The scope of the access requested from the provider.
- `authorizeUrl`: The URL to start the OAuth flow.
- `tokenUrl`: The URL to exchange the authorization code for an access token.
- `refreshTokenUrl`: (Optional) The URL to refresh the access token if applicable.
- `personalAccessToken`: (Optional) A personal token if the provider supports it.
- `extraParameters`: (Optional) The extra parameters you may need for the authorization request.
- `bodyEncoding`: (Optional) Specifies the format for sending the body of the request. Can be `json` for JSON-encoded body content or `url-encoded` for URL-encoded form data.

### Example

```ts
const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "GitHub",
  providerIcon: "extension_icon.png",
  providerId: "github",
  description: "Connect your GitHub account",
});

const github = new OAuthService({
  client,
  clientId: "7235fe8d42157f1f38c0",
  scopes: "notifications repo read:org read:user read:project",
  authorizeUrl: "https://github.oauth.raycast.com/authorize",
  tokenUrl: "https://github.oauth.raycast.com/token",
});
```

## Subclassing

You can subclass `OAuthService` to create a tailored service for other OAuth providers by setting predefined defaults.

Here's an example where `LinearOAuthService` subclasses `OAuthService`:

```ts
export class LinearOAuthService extends OAuthService {
  constructor(options: ClientConstructor) {
    super({
      client: new OAuth.PKCEClient({
        redirectMethod: OAuth.RedirectMethod.Web,
        providerName: "Linear",
        providerIcon: "linear.png",
        providerId: "linear",
        description: "Connect your Linear account",
      }),
      clientId: "YOUR_CLIENT_ID",
      authorizeUrl: "YOUR_AUTHORIZE_URL",
      tokenUrl: "YOUR_TOKEN_URL",
      scope: "YOUR_SCOPES"
      extraParameters: {
        actor: "user",
      },
    });
  }
}
```

## Built-in 3rd-party providers

Some 3rd-party providers subclassing `OAuthService` are exposed by default to make it easy to authenticate with them. Here's the full list:

- `AsanaOAuthService`
- `GitHubOAuthService`
- `GoogleOAuthService`
- `JiraOAuthService`
- `LinearOAuthService`
- `SlackOAuthService`
- `ZoomOAuthService`

### Example

Here's a basic example of how you'd use `GitHubOAuthService`:

```tsx
import { GitHubOAuthService } from "@your/library";

const github = new GitHubOAuthService({ scope: "notifications repo read:org read:user read:project" });
```

Note that you can also use your own client ID and provide a personal access token if needed:

```tsx
import { GitHubOAuthService } from "@your/library";

const preferences = getPreferenceValues<Preferences>()

const github = new GitHubOAuthService({ 
  clientId: "YOUR_CLIENT_ID",
  personalAccessToken: preferences.token,
  scope: "notifications repo read:org read:user read:project" 
});
```