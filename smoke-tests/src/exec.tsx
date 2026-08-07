import { List } from "@raycast/api";
import { useExec } from "@raycast/utils";
import { cpus } from "os";
import { useMemo } from "react";

const brewPath = cpus()[0].model.includes("Apple") ? "/opt/homebrew/bin/brew" : "/usr/local/bin/brew";

export default function () {
  const { isLoading, data } = useExec(brewPath, ["info", "--json=v2", "--installed"]);
  const results = useMemo<{ id: string; name: string }[]>(() => JSON.parse(data || "{}").formulae || [], [data]);

  return (
    <List isLoading={isLoading}>
      {results.map((item) => (
        <List.Item key={item.id} title={item.name} />
      ))}
    </List>
  );
}
