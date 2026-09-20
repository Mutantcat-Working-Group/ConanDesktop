import { describe, expect, it } from "vitest";

import {
  isValidProfileName,
  isValidRemoteName,
  isValidRemoteUrl,
  parseProfileSections,
} from "./validation";

describe("validation", () => {
  it("accepts safe profile and remote names", () => {
    expect(isValidProfileName("linux-gcc-13")).toBe(true);
    expect(isValidRemoteName("conancenter")).toBe(true);
  });

  it("rejects path traversal and unsafe profile names", () => {
    expect(isValidProfileName("../default")).toBe(false);
    expect(isValidProfileName("/tmp/default")).toBe(false);
    expect(isValidProfileName("")).toBe(false);
    expect(isValidRemoteName("remote name")).toBe(false);
  });

  it("accepts only supported remote URL schemes", () => {
    expect(isValidRemoteUrl("https://center2.conan.io")).toBe(true);
    expect(isValidRemoteUrl("http://artifactory.local/artifactory/api/conan/repo")).toBe(true);
    expect(isValidRemoteUrl("javascript:alert(1)")).toBe(false);
    expect(isValidRemoteUrl("ftp://repo.local")).toBe(false);
  });

  it("accepts private endpoints but keeps credentials out of persisted URLs", () => {
    expect(isValidRemoteUrl("https://repo.internal:8443/artifactory/api/conan/team" )).toBe(true);
    expect(isValidRemoteUrl("http://127.0.0.1:9300")).toBe(true);
    expect(isValidRemoteUrl("https://user:secret@repo.internal/conan")).toBe(false);
    expect(isValidRemoteUrl("https://repo.internal/conan?token=secret")).toBe(false);
    expect(isValidRemoteUrl("https://repo.internal/#token=secret")).toBe(false);
  });

  it("parses the common profile sections while ignoring comments and blanks", () => {
    const raw = [
      "include(default)",
      "",
      "# host configuration",
      "[settings]",
      "arch=armv8",
      "compiler.cppstd=gnu17",
      "",
      "[options]",
      "zlib/*:shared=True",
      "[conf]",
      "tools.cmake.cmaketoolchain:generator=Ninja",
    ].join("\n");

    const sections = parseProfileSections(raw);

    expect(sections.includes).toEqual(["include(default)"]);
    expect(sections.settings).toEqual({ arch: "armv8", "compiler.cppstd": "gnu17" });
    expect(sections.options).toEqual({ "zlib/*:shared": "True" });
    expect(sections.conf).toEqual({
      "tools.cmake.cmaketoolchain:generator": "Ninja",
    });
  });
});
