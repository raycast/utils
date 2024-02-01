import { Detail, LaunchProps } from "@raycast/api";
import { getAccessToken, withAccessToken, OAuthService } from "@raycast/utils";

const github = OAuthService.github({
  scope: "notifications repo read:org read:user read:project",
});

function AuthorizedComponent(props: LaunchProps<{ arguments: Arguments.OauthWithProps }>) {
  return <Detail markdown={`## Access token\n\n${getAccessToken().token}\n\n## Argument\n\n${props.arguments.text}`} />;
}

export default withAccessToken(github)(AuthorizedComponent);
