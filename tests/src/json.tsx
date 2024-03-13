import { List, environment } from "@raycast/api";
import { useCachedState, useJSON } from "@raycast/utils";
import { join } from "path";
import { useCallback, useMemo, useState } from "react";

type Formula = {
  name: string;
  desc?: string;
};

type Cask = {
  token: string;
  name: string[];
  desc?: string;
};

export default function Main(): JSX.Element {
  const [searchText, setSearchText] = useState("");
  const [type, setType] = useCachedState<"cask" | "formula" | "all">("all");

  const formulaFilter = useCallback(
    (item: Formula) => {
      if (!searchText) {
        return true;
      }
      return item.name.toLocaleLowerCase().includes(searchText);
    },
    [searchText],
  );

  const caskFilter = useCallback(
    (item: Cask) => {
      if (!searchText) {
        return true;
      }
      return item.name.join(",").toLocaleLowerCase().includes(searchText);
    },
    [searchText],
  );

  const {
    data: formulas,
    isLoading: isLoadingFormulas,
    pagination: formulaPagination,
  } = useJSON("https://formulae.brew.sh/api/formula.json", {
    pageSize: 10,
    fileName: "formulas",
    filter: formulaFilter,
  });
  const {
    data: casks,
    isLoading: isLoadingCasks,
    pagination: caskPagination,
  } = useJSON("https://formulae.brew.sh/api/cask.json", {
    pageSize: 10,
    fileName: "casks",
    filter: caskFilter,
  });
  return (
    <List
      isLoading={isLoadingFormulas || isLoadingCasks}
      pagination={{
        hasMore: formulaPagination.hasMore || caskPagination.hasMore,
        pageSize: Math.max(formulaPagination.pageSize, caskPagination.pageSize),
        onLoadMore: () => {
          formulaPagination.onLoadMore();
          caskPagination.onLoadMore();
        },
      }}
      throttle
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          value={type}
          storeValue
          tooltip=""
          onChange={(newValue: string) => {
            setType(newValue as "cask" | "formula" | "all");
          }}
        >
          <List.Dropdown.Item title="All" value="all" />
          <List.Dropdown.Item title="Casks" value="cask" />
          <List.Dropdown.Item title="Formulae" value="formula" />
        </List.Dropdown>
      }
    >
      {type === "cask" || type === "all" ? (
        <List.Section title="Casks">
          {casks.map((d) => (
            <List.Item key={d.token} title={d.name[0] ?? "Unknown"} subtitle={d.desc} />
          ))}
        </List.Section>
      ) : null}
      {type === "formula" || type === "all" ? (
        <List.Section title="Formulae">
          {formulas.map((d) => (
            <List.Item key={d.name} title={d.name} subtitle={d.desc} />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
