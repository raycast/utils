import { Detail } from "@raycast/api";
import { withAccessToken, OAuthService, getAccessToken } from "@raycast/utils";

const slack = OAuthService.slack({
  scope: "users.profile:write, dnd:write",
});

function AuthorizedComponent() {
  const { token } = getAccessToken();
  return <Detail markdown={`Access token: ${token}`} />;
}

export default withAccessToken(slack)(AuthorizedComponent);
