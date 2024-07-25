import { environment } from "@raycast/api";

export type DeeplinkType = "extension" | "script-command"

export type CreateScriptCommandDeeplinkOptions = {
  /**
   * The type of deeplink, which should be "script-command".
   */
  type: "script-command",
  /**
   * The name of the command.
   */
  command: string,
  /**
   * If the command accepts arguments, they can be passed using this query parameter.
   */
  arguments?: string[],
};

/**
 * Options for creating a deeplink to an extension.
 */
export type CreateExtensionDeeplinkOptions = {
  /**
   * The type of deeplink, which should be "extension".
   */
  type: "extension",
  /**
   * The name of the owner or author of the extension.
   */
  ownerOrAuthorName: string,
  /**
   * The name of the extension.
   */
  extensionName: string,
  /**
   * The command associated with the extension.
   */
  command: string,
  /**
   * Either "userInitiated", which runs the command in the foreground, or "background", which skips bringing Raycast to the front.
   */
  launchType?: "userInitiated" | "background",
  /**
   * If the command accepts arguments, they can be passed using this query parameter.
   */
  arguments?: {
    /**
     * The representation of arguments given that key here is the `name` defined in manifest file and value is the user's input
     */
    [item: string]: any;
  },
  /**
   * If the command make use of LaunchContext, it can be passed using this query parameter.
   */
  context?: {
    /**
     * The context values for a command launch.
     */
    [item: string]: any;
  },
  /**
   * Some text to prefill the search bar or first text input of the command
   */
  fallbackText?: string,
};

export type CreateDeeplinkOptions = CreateScriptCommandDeeplinkOptions | CreateExtensionDeeplinkOptions;

function getProtocol() {
  return environment.raycastVersion.includes("alpha") ? "raycastinternal://" : "raycast://";
}

export function createScriptCommandDeeplink(options: CreateScriptCommandDeeplinkOptions): string {
  const protocol = getProtocol();

  const params = new URLSearchParams();

  if (options.arguments) {
    for (const arg of options.arguments) {
      params.append("arguments", arg);
    }
  }

  return `${protocol}script-commands/${options.command}?${params.toString()}`;
}

export function createExtensionDeeplink(options: CreateExtensionDeeplinkOptions): string {
  const protocol = getProtocol();

  const params = new URLSearchParams();

  if (options.launchType) {
    params.append("launchType", options.launchType);
  }

  if (options.arguments) {
    params.append("arguments", JSON.stringify(options.arguments));
  }

  if (options.context) {
    params.append("context", JSON.stringify(options.context));
  }

  if (options.fallbackText) {
    params.append("fallbackText", options.fallbackText);
  }

  return `${protocol}extensions/${options.ownerOrAuthorName}/${options.extensionName}/${options.command}`;
}

export function createDeeplink(options: CreateDeeplinkOptions): string {
  if (options.type === "script-command") {
    return createScriptCommandDeeplink(options);
  } else {
    return createExtensionDeeplink(options);
  }
}
