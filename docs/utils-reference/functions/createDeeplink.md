# `createDeeplink`

Function that creates a deeplink for an extension or script command.

## Signature

There are three ways to use the function.

The first one is for creating a deeplink to a script command.

```ts
function createDeeplink(options: {
  type: DeeplinkType.ScriptCommand,
  command: string,
  arguments?: string[],
}): string;
```

The second one is for creating a deeplink to a command inside the current extension.

```ts
function createDeeplink(options: {
  type: DeeplinkType.Extension,
  command: string,
  launchType?: LaunchType,
  arguments?: LaunchProps["arguments"],
  fallbackText?: string,
}): string;
```

THe third one is for creating a deeplink to an extension that is not the current extension.

```ts
function createDeeplink(options: {
  type: DeeplinkType.Extension,
  ownerOrAuthorName: string,
  extensionName: string,

  command: string,
  launchType?: LaunchType,
  arguments?: LaunchProps["arguments"],
  fallbackText?: string,
}): string;
```

### Arguments

#### Script command

- `type` is the type of the deeplink. It must be `DeeplinkType.ScriptCommand`.
- `command` is the name of the script command to deeplink to.
- `arguments` is an array of strings to pass as arguments to the script command.

#### Extension

- `type` is the type of the deeplink. It must be `DeeplinkType.Extension`.
- `command` is the name of the command to deeplink to.
- `launchType` is the type of the launch.
- `arguments` is an object that contains the arguments to pass to the command.
- `fallbackText` is the text to show if the command is not available.
- For intra-extension deeplinks:
  - `ownerOrAuthorName` is the name of the owner or author of the extension.
  - `extensionName` is the name of the extension.

### Return

Returns a string.

## Example

```tsx
import { createDeeplink, DeeplinkType } from "@raycast/utils";

export default async function () {
  console.log(
    createDeeplink({
      type: DeeplinkType.ScriptCommand,
      command: "count-chars",
      arguments: ["count the number of chars in this string"],
    }),
  );

  console.log(
    createDeeplink({
      type: DeeplinkType.Extension,
      ownerOrAuthorName: "Aayush9029",
      extensionName: "cleanshotx",
      command: "capture-previous-area",
      arguments: {
        action: "copy",
      },
    }),
  )
```

## Types

### DeeplinkType

A type to denote whether the deeplink is for a script command or an extension.

```ts
export enum DeeplinkType {
  /** A script command */
  ScriptCommand = "script-command",
  /** An extension command */
  Extension = "extension",
}
```
