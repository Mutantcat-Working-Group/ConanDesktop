import { describe, expect, it } from "vitest";
import { extractPackageInfos, parsePackageDetails, parsePackageSearch } from "./packageParsing";

describe("Conan list JSON", () => {
  it("keeps private user/channel references intact without mixing them into versions", () => {
    const [row] = parsePackageSearch({ private: { "engine/2.10@team/stable": {} } }, "private");
    expect(row).toEqual({ reference: "engine/2.10@team/stable", name: "engine", version: "2.10", remote: "private" });
  });
  it("does not expose an error as a package", () => {
    expect(() => parsePackageSearch({ conancenter: { error: "403 Forbidden" } }, "conancenter")).toThrow("403 Forbidden");
  });
  it("handles a reference without revisions", () => {
    expect(extractPackageInfos({ conancenter: { "zlib/1.3.1": {} } })).toEqual([]);
  });
  it("orders versions numerically", () => {
    const rows = parsePackageSearch({ r: { "fmt/9.0": {}, "fmt/12.0": {} } }, "r");
    expect(rows[0].version).toBe("12.0");
  });
  it("handles missing and malformed data", () => {
    expect(parsePackageDetails(null)).toBeNull();
    expect(extractPackageInfos({ r: { "fmt/1": { revisions: null } } })).toEqual([]);
  });
  it("ignores null revisions, null binaries and invalid timestamps", () => {
    const value = { r: { "fmt/1": { revisions: { broken: null, good: { timestamp: Infinity, packages: { a: null, b: { info: { settings: { os: "Linux" } } } } } } } } };
    expect(parsePackageDetails(value)?.revisions.find((item) => item.id === "good")?.timestamp).toBeNull();
    expect(extractPackageInfos(value)).toHaveLength(1);
  });
  it("surfaces a remote error in package details", () => {
    expect(() => parsePackageDetails({ r: { error: "Access denied" } })).toThrow("Access denied");
  });
});
