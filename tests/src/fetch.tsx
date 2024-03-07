import { Detail, ActionPanel, Action } from "@raycast/api";
import { useFetch } from "@raycast/utils";

export default function Command() {
  const {
    isLoading: isLoadingFirst,
    data: firstData,
    revalidate: revalidateFirst,
  } = useFetch("https://raw.githubusercontent.com/mdn/dom-examples/main/fetch/fetch-text/page1.txt", {
    mapResult: (r: string) => {
      return { data: r.toLocaleUpperCase() };
    },
  });

  const {
    isLoading: isLoadingSecond,
    data: secondData,
    revalidate: revalidateSecond,
  } = useFetch("https://raw.githubusercontent.com/mdn/dom-examples/main/fetch/fetch-text/page1.txt", {
    parseResponse: (response) => response.text(),
    mapResult: (r) => {
      return { data: r.toLocaleLowerCase() };
    },
  });

  const isLoading = isLoadingFirst || isLoadingSecond;
  const data = `
## First:
${firstData}


## Second:
${secondData}
`;
  const revalidate = () => {
    revalidateFirst();
    revalidateSecond();
  };

  return (
    <Detail
      isLoading={isLoading}
      markdown={data}
      actions={
        <ActionPanel>
          <Action title="Reload" onAction={revalidate} />
        </ActionPanel>
      }
    />
  );
}
