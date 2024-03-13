import { List, environment } from "@raycast/api";
import { useJSON } from "@raycast/utils";
import { mkdirSync } from "fs";
import { join, sep } from "path";
import { useCallback, useState } from "react";

export const supportPath: string = (() => {
  try {
    mkdirSync(environment.supportPath, { recursive: true });
  } catch (err) {
    console.log("Failed to create supportPath");
  }
  return environment.supportPath;
})();

export const bundleIdentifier: string = (() => {
  return (
    environment.supportPath.split(sep).find((comp) => {
      if (comp.startsWith("com.raycast")) {
        return true;
      }
      return false;
    }) ?? "com.raycast.macos"
  );
})();

export function cachePath(name: string): string {
  return join(supportPath, name);
}

export interface Nameable {
  name: string;
}

interface Installable {
  tap: string;
  desc?: string;
  homepage: string;
  versions: Versions;
  outdated: boolean;
  caveats?: string;
}

export interface Cask extends Installable {
  token: string;
  name: string[];
  version: string;
  installed?: string; // version
  auto_updates: boolean;
  depends_on: CaskDependency;
  conflicts_with?: { cask: string[] };
}

export interface CaskDependency {
  macos?: { [key: string]: string[] };
}

export interface Formula extends Installable, Nameable {
  license: string;
  aliases: string[];
  dependencies: string[];
  build_dependencies: string[];
  installed: InstalledVersion[];
  keg_only: boolean;
  linked_key: string;
  pinned: boolean;
  conflicts_with?: string[];
}

interface Outdated extends Nameable {
  current_version: string;
}

export interface OutdatedFormula extends Outdated {
  installed_versions: string[];
  pinned_vesion?: string;
  pinned: boolean;
}

export interface OutdatedCask extends Outdated {
  installed_versions: string;
}

export interface InstalledVersion {
  version: string;
  installed_as_dependency: boolean;
  installed_on_request: boolean;
}

export interface Versions {
  stable: string;
  head?: string;
  bottle: boolean;
}

export interface InstallableResults {
  formulae: Formula[];
  casks: Cask[];
}

export interface OutdatedResults {
  formulae: OutdatedFormula[];
  casks: OutdatedCask[];
}

export default function Main(): JSX.Element {
  const [searchText, setSearchText] = useState("");

  const filter = useCallback(
    (item: Formula) => {
      return item.name.includes(searchText);
    },
    [searchText],
  );
  const { data, isLoading } = useJSON<Formula>(filter, { pageSize: 10 });

  return (
    <List isLoading={isLoading} throttle onSearchTextChange={setSearchText}>
      {data.map((d) => (
        <List.Item key={d.name} title={d.name} subtitle={d.desc} />
      ))}
    </List>
  );
}
