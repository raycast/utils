import { environment } from "@raycast/api";

export type DeeplinkType = "extension" | "script-command"

export type CreateScriptCommandDeeplinkOptions = {
  type: "script-command",
  command: string,
};

export type CreateExtensionCommandDeeplinkOptions = {
  type: "extension",
  ownerOrAuthorName: string,
  extensionName: string,
  command: string,
};

export type CreateDeeplinkOptions = CreateScriptCommandDeeplinkOptions | CreateExtensionCommandDeeplinkOptions;

function getProtocol() {
  return environment.raycastVersion.includes("alpha") ? "raycastinternal://" : "raycast://";
}

export function createDeeplink(options: CreateDeeplinkOptions): string {
  const protocol = getProtocol();

  switch (options.type) {
    case "extension":
      return `${protocol}extensions/${options.ownerOrAuthorName}/${options.extensionName}/${options.command}`;
    case "script-command":
      return `${protocol}script-commands/${options.command}`;
  }
}
