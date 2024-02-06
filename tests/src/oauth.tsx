import { Detail, LaunchProps } from "@raycast/api";
import { withAccessToken, OAuthService, getAccessToken } from "@raycast/utils";

const slack = OAuthService.slack({
  scope: 'users.profile:write, dnd:write', // Specify the scopes your application requires
});

function AuthorizedComponent(props: LaunchProps) {
  const { token } = getAccessToken();
  return <Detail markdown={`Access token: ${token}`} />;
}

export default withAccessToken(slack)(AuthorizedComponent);
