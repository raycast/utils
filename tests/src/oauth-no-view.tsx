import { showHUD } from "@raycast/api";
import { GitHubOAuthService, getAccessToken, withAccessToken } from "@raycast/utils";

const github = new GitHubOAuthService({ scope: "notifications repo read:org read:user read:project" });

async function Command() {
  const { token } = getAccessToken();
  await showHUD(token);
}

export default withAccessToken(github)(Command);
