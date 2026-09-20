import { expect, it } from "vitest";
import { shortenPath } from "./format";

it("elides paths without reordering segments or exceeding the limit", () => {
  const path = "/Users/alex/projects/a-very-long-project/src/build";
  const result = shortenPath(path, 30);
  expect(result.length).toBeLessThanOrEqual(30);
  const [left, right] = result.split("...");
  expect(path.startsWith(left)).toBe(true);
  expect(path.endsWith(right)).toBe(true);
  expect(shortenPath("/short")).toBe("/short");
});
