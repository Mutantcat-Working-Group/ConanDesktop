import { afterEach, expect, it } from "vitest";
import { api } from "./api";

afterEach(() => window.history.replaceState({}, "", "/"));

it("rejects browser access without explicit demo mode", async () => {
  await expect(api.listProfiles()).rejects.toThrow("浏览器预览");
});

it("never claims a browser mutation was persisted", async () => {
  window.history.replaceState({}, "", "/?demo=1");
  await expect(api.saveAppSettings({ conanExecutable: null, defaultProjectDir: null })).rejects.toThrow("浏览器预览");
  await expect(api.createProfile("test")).rejects.toThrow("浏览器预览");
});

it("never fakes a live repository check in demo mode", async () => {
  window.history.replaceState({}, "", "/?demo=1");
  await expect(api.checkRemote("private")).rejects.toThrow("浏览器预览");
});
