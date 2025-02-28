import { showToast } from "@raycast/api";
import { withCache } from "@raycast/utils";

async function expensiveFunction() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return "Hello, world!";
}

const cachedFrunction = withCache(expensiveFunction);

export default async function () {
  console.time("Uncached");
  const res = await cachedFrunction();
  console.timeEnd("Uncached");

  await showToast({ title: "Uncached result: " + res });

  console.time("Cached");
  const res2 = await cachedFrunction();
  console.timeEnd("Cached");

  await showToast({ title: "Cached result: " + res2 });
}
