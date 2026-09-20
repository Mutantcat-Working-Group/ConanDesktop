import { describe, expect, it } from "vitest";

import { parseCmakeCache } from "./cmake";

describe("parseCmakeCache", () => {
  it("extracts CMake variables and values", () => {
    const content = [
      "# This is the CMakeCache file.",
      "CMAKE_HOME_DIRECTORY:INTERNAL=/Users/me/project",
      "CMAKE_GENERATOR:INTERNAL=Ninja",
      "CMAKE_BUILD_TYPE:STRING=Release",
      "CMAKE_CXX_COMPILER:FILEPATH=/usr/bin/clang++",
      "",
    ].join("\n");

    const cache = parseCmakeCache(content);

    expect(cache.CMAKE_HOME_DIRECTORY).toBe("/Users/me/project");
    expect(cache.CMAKE_GENERATOR).toBe("Ninja");
    expect(cache.CMAKE_BUILD_TYPE).toBe("Release");
    expect(cache.CMAKE_CXX_COMPILER).toBe("/usr/bin/clang++");
  });

  it("ignores malformed cache lines", () => {
    expect(parseCmakeCache("not-a-cache-line")).toEqual({});
  });
});
