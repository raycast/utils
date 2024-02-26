import { renderHook, act } from "@testing-library/react-hooks";
import fetch from "cross-fetch";
import { usePromise } from "./usePromise";

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

test("it works", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    usePromise(async () => {
      const response = await fetch("https://api.ycombinator.com/v0.1/companies");
      const json = (await response.json()) as SearchResult;
      return json.companies;
    }),
  );

  await act(async () => {
    await waitForNextUpdate({ timeout: 10000 });
  });

  expect(result.current.data).toHaveLength(25);
});
