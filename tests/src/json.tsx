import { Action, ActionPanel, List, environment } from "@raycast/api";
import { useCachedState, useJSON } from "@raycast/utils";
import { join } from "path";
import { useCallback, useState } from "react";
import { setTimeout } from "timers/promises";

type Formula = { name: string; desc?: string };

type Cask = { token: string; name: string[]; desc?: string };

export default function Main(): JSX.Element {
  const [searchText, setSearchText] = useState("");
  const [type, setType] = useCachedState<"cask" | "formula">("cask");

  const formulaFilter = useCallback(
    (item: Formula) => {
      if (!searchText) return true;
      return item.name.toLocaleLowerCase().includes(searchText);
    },
    [searchText],
  );

  const caskFilter = useCallback(
    (item: Cask) => {
      if (!searchText) return true;
      return item.name.join(",").toLocaleLowerCase().includes(searchText);
    },
    [searchText],
  );

  const {
    data: formulae,
    mutate: mutateFormulae,
    isLoading: isLoadingFormulae,
    pagination: formulaPagination,
  } = useJSON("https://formulae.brew.sh/api/formula.json", {
    initialData: [] as Formula[],
    pageSize: 10,
    folder: join(environment.supportPath, "cache"),
    fileName: "formulas",
    filter: formulaFilter,
    execute: type === "formula",
  });

  const {
    data: casks,
    mutate: mutateCasks,
    isLoading: isLoadingCasks,
    pagination: caskPagination,
  } = useJSON("https://formulae.brew.sh/api/cask.json", {
    initialData: [] as Cask[],
    folder: join(environment.supportPath, "cache"),
    pageSize: 10,
    fileName: "casks",
    filter: caskFilter,
    execute: type === "cask",
  });

  return (
    <List
      isLoading={isLoadingFormulae || isLoadingCasks}
      pagination={type === "cask" ? caskPagination : formulaPagination}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          value={type}
          tooltip=""
          onChange={(newValue: string) => {
            setType(newValue as "cask" | "formula");
          }}
        >
          <List.Dropdown.Item title="Casks" value="cask" />
          <List.Dropdown.Item title="Formulae" value="formula" />
        </List.Dropdown>
      }
    >
      {type === "cask" ? (
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
      ) : (
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
    </List>
  );
}
