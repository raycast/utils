import { List, ActionPanel, Action } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";

export default function Command() {
  const [searchText, setSearchText] = useState<string>("");
  const { isLoading, data, revalidate } = usePromise(
    async (text: string) => {
      await sleep(300);
      return `result: ${text}`;
    },
    [searchText],
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
      <List.Item title={data || ""} />
    </List>
  );
}

const sleep = function (ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
