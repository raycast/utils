import { ActionPanel, Action, Icon, Image, List, Grid } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useState } from "react";

type SearchResult = {
  companies: Company[];
  page: number;
  totalPages: number;
};

type Company = {
  id: number;
  name: string;
  slug: string;
  website: string;
  smallLogoUrl?: string;
  oneLiner: string;
  longDescription: string;
  teamSize: number;
  url: string;
  batch: string;
  tags: string[];
  status: string;
  industries: string[];
  regions: string[];
  locations: string[];
  badges: string[];
};
function getSearchParams(searchText: string, page: number) {
  const params = new URLSearchParams({ page: String(page) });

  if (searchText !== "") {
    params.set("q", searchText);
  }

  return params;
}

export default function Command() {
  const [searchText, setSearchText] = useState("");

  const { isLoading, pagination, data, revalidate } = useFetch(
    (pagination) =>
      "https://api.ycombinator.com/v0.1/companies?" + getSearchParams(searchText, pagination.page + 1).toString(),
    {
      mapResult(result: SearchResult) {
        return {
          data: result.companies,
          hasMore: result.page < result.totalPages,
        };
      },
      keepPreviousData: true,
      initialData: [],
    },
  );

  return (
    <List isLoading={isLoading} pagination={pagination} onSearchTextChange={setSearchText}>
      {data?.map((company) => (
        <List.Item
          key={company.id}
          icon={{ source: company.smallLogoUrl ?? Icon.MinusCircle, mask: Image.Mask.RoundedRectangle }}
          title={company.name}
          actions={
            <ActionPanel title={company.name}>
              <Action title="Reload" onAction={() => revalidate()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
