import { Action, ActionPanel, List, environment } from "@raycast/api";
import { useCachedState, useStreamJSON } from "@raycast/utils";
import { join } from "path";
import { useCallback, useState } from "react";
import { setTimeout } from "timers/promises";

type Formula = { name: string; desc?: string };

type Cask = { token: string; name: string[]; desc?: string };

export default function Main(): JSX.Element {
  const [searchText, setSearchText] = useState("");
  const [type, setType] = useCachedState<"cask" | "formula" | "nestedData">("cask");

  const formulaFilter = useCallback(
    (item: Formula) => {
      if (!searchText) return true;
      return item.name.toLocaleLowerCase().includes(searchText);
    },
    [searchText],
  );

  const formulaTransform = useCallback((item: any): Formula => {
    return { name: item.name, desc: item.desc };
  }, []);

  const {
    data: formulae,
    mutate: mutateFormulae,
    isLoading: isLoadingFormulae,
    pagination: formulaPagination,
  } = useStreamJSON("https://formulae.brew.sh/api/formula.json", {
    initialData: [] as Formula[],
    pageSize: 20,
    filter: formulaFilter,
    transform: formulaTransform,
    execute: type === "formula",
  });

  const caskFilter = useCallback(
    (item: Cask) => {
      if (!searchText) return true;
      return item.name.join(",").toLocaleLowerCase().includes(searchText);
    },
    [searchText],
  );

  const caskTransform = useCallback((item: any): Cask => {
    return { token: item.token, name: item.name, desc: item.desc };
  }, []);

  const {
    data: casks,
    mutate: mutateCasks,
    isLoading: isLoadingCasks,
    pagination: caskPagination,
  } = useStreamJSON("https://formulae.brew.sh/api/cask.json", {
    initialData: [] as Cask[],
    pageSize: 20,
    filter: caskFilter,
    transform: caskTransform,
    execute: type === "cask",
  });

  const nestedDataFilter = useCallback(
    (item: string) => {
      if (!searchText) return true;
      return item.toLocaleLowerCase().includes(searchText);
    },
    [searchText],
  );

  const nestedDataTransform = useCallback((item: string): string => {
    return item.toLocaleLowerCase();
  }, []);

  const {
    data: nestedData,
    mutate: mutateNestedData,
    isLoading: isLoadingDataKey,
    pagination: nestedDataPagination,
  } = useStreamJSON(`file:///${join(environment.assetsPath, "stream-json-nested-object.json")}`, {
    initialData: [] as string[],
    dataPath: /^nested.data$/,
    filter: nestedDataFilter,
    transform: nestedDataTransform,
    execute: type === "nestedData",
  });

  return (
    <List
      isLoading={isLoadingFormulae || isLoadingCasks || isLoadingDataKey}
      pagination={type === "cask" ? caskPagination : type === "formula" ? formulaPagination : nestedDataPagination}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          value={type}
          tooltip=""
          onChange={(newValue: string) => {
            setType(newValue as "cask" | "formula" | "nestedData");
          }}
        >
          <List.Dropdown.Item title="Casks" value="cask" />
          <List.Dropdown.Item title="Formulae" value="formula" />
          <List.Dropdown.Item title="Nested Data" value="nestedData" />
        </List.Dropdown>
      }
    >
      {type === "cask" && (
        <List.Section title="Casks">
          {casks?.map((d) => {
            return (
              <List.Item
                key={d.token}
                title={d.name[0] ?? "Unknown"}
                subtitle={d.desc}
                actions={
                  <ActionPanel>
                    <Action
                      title="Delete All Items But This One"
                      onAction={async () => {
                        mutateCasks(setTimeout(5000), {
                          optimisticUpdate: () => {
                            return [d];
                          },
                        });
                      }}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      {type === "formula" && (
        <List.Section title="Formulae">
          {formulae?.map((d) => {
            return (
              <List.Item
                key={d.name}
                title={d.name}
                subtitle={d.desc}
                actions={
                  <ActionPanel>
                    <Action
                      title="Delete All Items But This One"
                      onAction={async () => {
                        mutateFormulae(setTimeout(5000), {
                          optimisticUpdate: () => {
                            return [d];
                          },
                        });
                      }}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      {type === "nestedData" && (
        <List.Section title="Nested Data">
          {nestedData?.map((d) => {
            return (
              <List.Item
                key={d}
                title={d}
                actions={
                  <ActionPanel>
                    <Action
                      title="Delete All Items But This One"
                      onAction={async () => {
                        mutateNestedData(setTimeout(5000), {
                          optimisticUpdate: () => {
                            return [d];
                          },
                        });
                      }}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
