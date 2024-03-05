import { Detail, ActionPanel, Action } from "@raycast/api";
import { useFetch } from "@raycast/utils";

export default function Command() {
  const { isLoading, data, revalidate } = useFetch<string>(
    "https://raw.githubusercontent.com/mdn/dom-examples/main/fetch/fetch-text/page1.txt",
    {
      mapResult: (r) => {
        return { data: r.toLocaleLowerCase() };
      },
    },
  );

  return (
    <Detail
      isLoading={isLoading}
      markdown={data}
      actions={
        <ActionPanel>
          <Action title="Reload" onAction={() => revalidate()} />
        </ActionPanel>
      }
    />
  );
}
