import { useRef, useState } from "react";
import { AI } from "@raycast/api";
import { PromiseOptions, usePromise } from "./usePromise";
import { FunctionReturningPromise } from "./types";

/**
 * Stream a prompt completion.
 *
 * @example
 * ```typescript
 * import { Detail, LaunchProps } from "@raycast/api";
 * import { use AI } from "@raycast/utils";
 *
 * export default function Command(props: LaunchProps<{ arguments: { prompt: string } }>) {
 *   const { isLoading, data } = useAI(props.arguments.prompt);
 *
 *   return <Detail isLoading={isLoading} markdown={data} />;
 * }
 * ```
 */
export function useAI(
  prompt: string,
  options: {
    /**
     * Concrete tasks, such as fixing grammar, require less creativity while open-ended questions, such as generating ideas, require more.
     * If a number is passed, it needs to be in the range 0-2. For larger values, 2 will be used. For lower values, 0 will be used.
     */
    creativity?: AI.Creativity;
    /**
     * The AI model to use to answer to the prompt.
     */
    model?: AI.Model;
    /**
     * Whether to stream the answer or only update the data when the entire answer has been received.
     */
    stream?: boolean;
  } & Omit<PromiseOptions<FunctionReturningPromise>, "abortable"> = {}
) {
  const { creativity, stream, model, ...usePromiseOptions } = options;
  const [data, setData] = useState("");
  const abortable = useRef<AbortController>();
  const { isLoading, error, revalidate } = usePromise(
    async (prompt: string, creativity?: AI.Creativity, shouldStream?: boolean) => {
      setData("");
      const stream = AI.ask(prompt, { creativity, model, signal: abortable.current?.signal });
      if (shouldStream === false) {
        setData(await stream);
      } else {
        stream.on("data", (data) => {
          setData((x) => x + data);
        });
        await stream;
      }
    },
    [prompt, creativity, stream],
    { ...usePromiseOptions, abortable }
  );

  return { isLoading, data, error, revalidate };
}
