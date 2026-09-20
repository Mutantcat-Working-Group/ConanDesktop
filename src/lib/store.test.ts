import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { useAppStore } from "./store";

beforeEach(() => useAppStore.setState({ profileDrafts: {} }));
afterEach(() => vi.restoreAllMocks());

it("clears stale ready status when environment detection fails", async () => {
  useAppStore.setState({ environment: {
    detected: true, executable: "/bin/conan", version: "2.16.1",
    conanHome: "/home/conan", profilesPath: null, remotesPath: null, error: null,
  } });
  vi.spyOn(api, "detectConanEnvironment").mockRejectedValue(new Error("Unavailable"));
  await useAppStore.getState().refreshEnvironment();
  expect(useAppStore.getState().environment).toBeNull();
  expect(useAppStore.getState().environmentLoading).toBe(false);
  expect(useAppStore.getState().error).toBe("Unavailable");
});

it("keeps independent profile drafts across page lifetimes", () => {
  useAppStore.getState().setProfileDraft("default", "one");
  useAppStore.getState().setProfileDraft("release", "two");
  expect(useAppStore.getState().profileDrafts).toEqual({ default: "one", release: "two" });
  useAppStore.getState().setProfileDraft("default", null);
  expect(useAppStore.getState().profileDrafts).toEqual({ release: "two" });
});
