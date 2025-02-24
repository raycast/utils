import { showToast } from "@raycast/api";
import { withCache } from "@raycast/utils";

async function expensiveFunction() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return "Hello, world!";
}

export default async function () {
  console.time("Uncached");
  const res = await withCache(expensiveFunction);
  console.timeEnd("Uncached");

  await showToast({ title: "Uncached result: " + res });

  console.time("Cached");
  const res2 = await withCache(expensiveFunction);
  console.timeEnd("Cached");

  await showToast({ title: "Cached result: " + res2 });
}
