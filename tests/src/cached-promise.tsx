import { List, ActionPanel, Action } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

export default function Command() {
  const [searchText, setSearchText] = useState<string>("");
  const { isLoading, data, revalidate } = useCachedPromise(
    async (text: string) => {
      await sleep(300);
      return `result: ${text}`;
    },
    [searchText],
    {
      initialData: "Shown before any data is loaded",
      keepPreviousData: true,
    }
  );

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      actions={
        <ActionPanel>
          <Action title="Reload" onAction={() => revalidate()} />
        </ActionPanel>
      }
    >
      <List.Item title={data} />
    </List>
  );
}

const sleep = function (ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
