import * as fs from "fs";
import * as path from "path";
import { Clipboard, environment, open, Toast, showToast } from "@raycast/api";

/**
 * Shows a failure Toast for a given Error.
 *
 * @example
 * ```typescript
 * import { showHUD } from "@raycast/api";
 * import { runAppleScript, showFailureToast } from "@raycast/utils";
 *
 * export default async function () {
 *   try {
 *     const res = await runAppleScript(
 *       `
 *       on run argv
 *         return "hello, " & item 1 of argv & "."
 *       end run
 *       `,
 *       ["world"]
 *     );
 *     await showHUD(res);
 *   } catch (error) {
 *     showFailureToast(error, { title: "Could not run AppleScript" });
 *   }
 * }
 * ```
 */
export function showFailureToast(error: unknown, options?: { title?: string; primaryAction?: Toast.ActionOptions }) {
  const message = error instanceof Error ? error.message : String(error);
  return showToast({
    style: Toast.Style.Failure,
    title: options?.title ?? "Something went wrong",
    message: message,
    primaryAction: options?.primaryAction ?? handleErrorToastAction(error),
    secondaryAction: options?.primaryAction ? handleErrorToastAction(error) : undefined,
  });
}

const handleErrorToastAction = (error: unknown): Toast.ActionOptions => {
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

  const stack = error instanceof Error ? error?.stack || error?.message || "" : String(error);

  return {
    title: fallback ? "Copy Logs" : "Report Error",
    onAction(toast) {
      toast.hide();
      if (fallback) {
        Clipboard.copy(stack);
      } else {
        open(
          `https://github.com/raycast/extensions/issues/new?&labels=extension%2Cbug&template=extension_bug_report.yml&title=${encodeURIComponent(
            title
          )}&extension-url=${encodeURI(extensionURL)}&description=${encodeURIComponent(
            `#### Error:
\`\`\`
${stack}
\`\`\`
`
          )}`
        );
      }
    },
  };
};
