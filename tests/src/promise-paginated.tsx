import { List, ActionPanel, Action } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";

export default function Command() {
  const [searchText, setSearchText] = useState<string>("");

  const { isLoading, data, revalidate, pagination } = usePromise(
    (text: string) => async (options: { page: number; lastItem?: string }) => {
      await sleep(500);
      const data = items(text, options.page);
      return { data, hasMore: options.page < 20 };
    },
    [searchText],
  );

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      pagination={pagination}
      actions={
        <ActionPanel>
          <Action title="Reload" onAction={() => revalidate()} />
        </ActionPanel>
      }
    >
      {data?.map((item) => <List.Item key={item} title={item} />)}
    </List>
  );
}

const sleep = function (ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const items = function (searchText: string, page: number) {
  const result = [];
  for (let i = 0; i < 50; i++) {
    result.push(`result: ${searchText} - ${i} - ${page}`);
  }

  if (page === 5) {
    return result.slice(0, 10);
  }
  return result;
};
