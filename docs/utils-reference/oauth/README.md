# OAuth

Authenticating with OAuth in Raycast extensions is tedious. So we've built a set of utilities to make that task way easier. There's two part to our utilities:

1. Authenticating with the service using [OAuthService](utils-reference/oauth/OAuthService.md) and providers we provide out of the box (e.g GitHub with `GitHubOAuthService`)
2. Bringing authentication to React components using [withAccessToken](utils-reference/oauth/withAccessToken.md) and [`getAccessToken`](utils-reference/oauth/withAccessToken.md#getAccessToken)

Here are two different use-cases where you can use the utilities.

## Using a built-in provider

We provide 3rd party providers that you can use out of the box such as GitHub or Linear. Here's how you can use them:

```tsx
import { Detail, LaunchProps } from "@raycast/api";
import { withAccessToken, getAccessToken, GitHubOAuthService } from "@raycast/utils";

const github = new GitHubOAuthService({ 
  scopes: "notifications repo read:org read:user read:project" 
});

function AuthorizedComponent(props: LaunchProps) {
  const { token } = getAccessToken();
  return <Detail markdown={`Access token: ${token}`} />;
}

export default withAccessToken(github)(AuthorizedComponent);
```

## Using your own client

```tsx
import { OAuth, Detail, LaunchProps } from "@raycast/api";
import { withAccessToken, getAccessToken, getAuthorizeFunction } from "@raycast/utils/oauth";

const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "Your Provider Name",
  providerIcon: "provider_icon.png",
  providerId: "yourProviderId",
  description: "Connect your {PROVIDER_NAME} account",
});

const provider = new OAuthService({
  client,
  clientId: "YOUR_CLIENT_ID",
  scopes: "YOUR SCOPES",
  authorizeUrl: "YOUR_AUTHORIZE_URL",
  tokenUrl: "YOUR_TOKEN_URL",
});

function AuthorizedComponent(props: LaunchProps) {
  const { token } = getAccessToken();
  return <Detail markdown={`Access token: ${token}`} />;
}

export default withAccessToken({ authorize: provider.authorize })(AuthorizedComponent);
```

## Additional information

If you need more information, please take a look at the subpages: [OAuthService](utils-reference/oauth/OAuthService.md) and [withAccessToken](utils-reference/oauth/withAccessToken.md)