import * as fs from "fs";
import * as path from "path";
import { Clipboard, environment, open, Toast } from "@raycast/api";

export const handleErrorToastAction = (error: Error): Toast.ActionOptions => {
  let privateExtension = true;
  let title = "[Extension Name]...";
  let extensionURL = "";
  try {
    const packageJSON = JSON.parse(fs.readFileSync(path.join(environment.assetsPath, "..", "package.json"), "utf8"));
    title = `[${packageJSON.title}]...`;
    extensionURL = `https://raycast.com/${packageJSON.owner || packageJSON.author}/${packageJSON.name}`;
    if (!packageJSON.owner || packageJSON.access === "public") {
      privateExtension = false;
    }
  } catch (err) {
    // no-op
  }

  // if it's a private extension, we can't construct the URL to report the error
  // so we fallback to copying the error to the clipboard
  const fallback = environment.isDevelopment || privateExtension;

  return {
    title: fallback ? "Copy Logs" : "Report Error",
    onAction(toast) {
      toast.hide();
      if (fallback) {
        Clipboard.copy(error?.stack || error?.message || "");
      } else {
        open(
          `https://github.com/raycast/extensions/issues/new?&labels=extension%2Cbug&template=extension_bug_report.yml&title=${encodeURIComponent(
            title
          )}&extension-url=${encodeURI(extensionURL)}&description=${encodeURIComponent(
            `#### Error:
\`\`\`
${error?.stack || error?.message || ""}
\`\`\`
`
          )}`
        );
      }
    },
  };
};
