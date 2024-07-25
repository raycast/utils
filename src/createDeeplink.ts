import { environment } from "@raycast/api";

export type DeeplinkType = "extension" | "script-command"

export type CreateScriptCommandDeeplinkOptions = {
  type: "script-command",
  command: string,
  arguments: string[],
};

export type CreateExtensionDeeplinkOptions = {
  type: "extension",
  ownerOrAuthorName: string,
  extensionName: string,
  command: string,
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

  return `${protocol}extensions/${options.ownerOrAuthorName}/${options.extensionName}/${options.command}`;
}

export function createDeeplink(options: CreateDeeplinkOptions): string {
  if (options.type === "script-command") {
    return createScriptCommandDeeplink(options);
  } else {
    return createExtensionDeeplink(options);
  }
}
