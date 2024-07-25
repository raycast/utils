import { environment, LaunchProps, LaunchType } from "@raycast/api";

export enum DeeplinkType {
  ScriptCommand = "script-command",
  Extension = "extension",
}

/**
 * Options for creating a deeplink to a script command.
 */
export type CreateScriptCommandDeeplinkOptions = {
  /**
   * The type of deeplink, which should be "script-command".
   */
  type: DeeplinkType.ScriptCommand,
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
 * Base options for creating a deeplink to an extension.
 */
export type CreateExtensionDeeplinkBaseOptions = {
  /**
   * The type of deeplink, which should be "extension".
   */
  type: "extension",
  /**
   * The command associated with the extension.
   */
  command: string,
  /**
   * Either "userInitiated", which runs the command in the foreground, or "background", which skips bringing Raycast to the front.
   */
  launchType?: LaunchType,
  /**
   * If the command accepts arguments, they can be passed using this query parameter.
   */
  arguments?: LaunchProps["arguments"],
  /**
   * If the command make use of LaunchContext, it can be passed using this query parameter.
   */
  context?: LaunchProps["launchContext"],
  /**
   * Some text to prefill the search bar or first text input of the command
   */
  fallbackText?: string,
};

/**
 * Options for creating a deeplink to an extension from another extension.
 * Requires both the ownerOrAuthorName and extensionName.
 */
export type CreateInterExtensionDeeplinkOptions = CreateExtensionDeeplinkBaseOptions & {
  /**
   * The name of the owner or author of the extension.
   */
  ownerOrAuthorName: string,
  /**
   * The name of the extension.
   */
  extensionName: string
};

/**
 * Options for creating a deeplink to an extension.
 */
export type CreateExtensionDeeplinkOptions = CreateInterExtensionDeeplinkOptions | CreateExtensionDeeplinkBaseOptions

/**
 * Options for creating a deeplink.
 */
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

  let ownerOrAuthorName = environment.ownerOrAuthorName;
  let extensionName = environment.extensionName;

  if ("ownerOrAuthorName" in options && "extensionName" in options) {
    ownerOrAuthorName = options.ownerOrAuthorName;
    extensionName = options.extensionName;
  }

  return `${protocol}extensions/${ownerOrAuthorName}/${extensionName}/${options.command}?${params.toString()}`;
}

/**
 * Creates a deeplink to a script command or extension.
 */
export function createDeeplink(options: CreateDeeplinkOptions): string {
  if (options.type === DeeplinkType.ScriptCommand) {
    return createScriptCommandDeeplink(options);
  } else {
    return createExtensionDeeplink(options);
  }
}
