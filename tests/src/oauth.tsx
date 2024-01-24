import { Detail } from "@raycast/api";
import { getAccessToken, withAccessToken, OAuthService } from "@raycast/utils";

const github = OAuthService.github({
  scope: "notifications repo read:org read:user read:project",
});

function AuthorizedComponent() {
  return <Detail markdown={`Access token: ${getAccessToken().token}`} />;
}

export default withAccessToken(github)(AuthorizedComponent);
