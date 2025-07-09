import { showHUD } from "@raycast/api";
import { runPowerShellScript } from "@raycast/utils";

export default async function () {
  const res = await runPowerShellScript(
    `
    Write-Host "hello, world."
    `,
  );
  await showHUD(res);
}
