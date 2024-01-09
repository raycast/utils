import { Detail } from "@raycast/api";
import { GitHubOAuthService, getAccessToken, withAccessToken } from "@raycast/utils";

const github = new GitHubOAuthService({
  scope: "notifications repo read:org read:user read:project",
  onAuthorize({ token, type }) {
    console.log(`Authorized with ${type} token: ${token}`);
  },
});

function AuthorizedComponent() {
  return <Detail markdown={`Access token: ${getAccessToken().token}`} />;
}

export default withAccessToken(github)(AuthorizedComponent);
