# `exec`

A function that executes a command and returns a `Promise` that resolves with its parsed output.

This is the imperative sibling of [`useExec`](../react-hooks/useExec.md), meant for code that runs outside of a React render: AI tool functions, `no-view` commands, and scripts. It shares the same cross-OS command resolution as the hook, so the same call works on macOS, Linux, and Windows. On Windows it resolves `.cmd`/`.bat` shims through `PATHEXT` (so `npx` finds `npx.cmd` instead of throwing `ENOENT`) and escapes arguments correctly, without needing the `shell` option.

## Signature

There are two ways to use the function.

The first one should be preferred when executing a single file. The file and its arguments don't have to be escaped.

```ts
function exec<T = string>(
  file: string,
  arguments: string[],
  options?: {
    shell?: boolean | string;
    stripFinalNewline?: boolean;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    encoding?: BufferEncoding | "buffer";
    input?: string | Buffer;
    timeout?: number;
    signal?: AbortSignal;
    parseOutput?: ParseExecOutputHandler<T>;
  },
): Promise<T>;
```

The second one can be used to execute more complex commands. The file and arguments are specified in a single `command` string. For example, `exec("echo", ["Raycast"])` is the same as `exec("echo Raycast")`.

If the file or an argument contains spaces, they must be escaped with backslashes. This matters especially if `command` is not a constant but a variable, for example with `environment.supportPath` or `process.cwd()`. Except for spaces, no escaping/quoting is needed.

The `shell` option must be used if the command uses shell-specific features (for example, `&&` or `||`), as opposed to being a simple file followed by its arguments.

```ts
function exec<T = string>(
  command: string,
  options?: {
    shell?: boolean | string;
    stripFinalNewline?: boolean;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    encoding?: BufferEncoding | "buffer";
    input?: string | Buffer;
    timeout?: number;
    signal?: AbortSignal;
    parseOutput?: ParseExecOutputHandler<T>;
  },
): Promise<T>;
```

### Arguments

- `file` is the path to the file to execute.
- `arguments` is an array of strings to pass as arguments to the file.

or

- `command` is the string to execute.

With a few options:

- `options.shell` is a boolean or a string to tell whether to run the command inside of a shell or not. If `true`, uses `/bin/sh`. A different shell can be specified as a string. The shell should understand the `-c` switch.

  We recommend against using this option since it is:

  - not cross-platform, encouraging shell-specific syntax.
  - slower, because of the additional shell interpretation.
  - unsafe, potentially allowing command injection.

- `options.stripFinalNewline` is a boolean to tell the function to strip the final newline character from the output. By default, it will.
- `options.cwd` is a string to specify the current working directory of the child process. By default, it will be `process.cwd()`.
- `options.env` is a key-value pairs to set as the environment of the child process. It will extend automatically from `process.env`.
- `options.encoding` is a string to specify the character encoding used to decode the `stdout` and `stderr` output. If set to `"buffer"`, then `stdout` and `stderr` will be a `Buffer` instead of a string.
- `options.input` is a string or a Buffer to write to the `stdin` of the file.
- `options.timeout` is a number. If greater than `0`, the parent will send the signal `SIGTERM` if the child runs longer than timeout milliseconds. By default, the execution will timeout after 10000ms (eg. 10s).
- `options.signal` is an `AbortSignal` that allows you to abort the command via an `AbortController`.
- `options.parseOutput` is a function that accepts the output of the child process as an argument and returns the data the function will resolve with - see [ParseExecOutputHandler](../react-hooks/useExec.md#parseexecoutputhandler). By default, the function will return `stdout`.

### Return

Returns a `Promise` that resolves with the parsed output of the command (by default, its `stdout` as a string). If the command fails, times out, or is killed by a signal, the `Promise` rejects with an `Error` carrying `exitCode`, `signal`, `stdout`, and `stderr`.

## Example

```typescript
import { Clipboard } from "@raycast/api";
import { exec } from "@raycast/utils";

export default async function Command() {
  const output = await exec("git", ["rev-parse", "HEAD"], { cwd: "/path/to/repo" });
  await Clipboard.copy(output);
}
```
