import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import RemotesDrawer from "./RemotesDrawer";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const getComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  useAppStore.setState({ remotesLoading: false, remotes: [
    { name: "private", url: "https://repo.internal/artifactory/api/conan/team", enabled: true, verifySsl: true, allowedPackages: [], authenticated: true, username: "tester" },
    { name: "disabled", url: "http://localhost:9300", enabled: false, verifySsl: true, allowedPackages: [] },
  ] });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("distinguishes cached credentials from live verification and disables inactive checks", async () => {
  const check = vi.spyOn(api, "checkRemote").mockResolvedValue({ success: true, kind: "ok", message: "Conan 只读查询成功。" });
  render(<RemotesDrawer open onClose={() => {}} />);
  expect(screen.getByText("已缓存")).toBeTruthy();
  expect(screen.queryByText("Conan 只读查询成功。")).toBeNull();
  expect((screen.getByRole("button", { name: "检测连接 disabled" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "检测连接 private" }));
  await waitFor(() => expect(screen.getByText("Conan 只读查询成功。")).toBeTruthy());
  expect(check).toHaveBeenCalledWith("private");
});

it("keeps permission failure details visible", async () => {
  vi.spyOn(api, "checkRemote").mockResolvedValue({ success: false, kind: "permission", message: "403 Forbidden" });
  render(<RemotesDrawer open onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "检测连接 private" }));
  await waitFor(() => expect(screen.getByText("403 Forbidden")).toBeTruthy());
  expect(screen.getByText("private · 访问被拒绝")).toBeTruthy();
});
