import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Modal } from "antd";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import ProjectsPage from "./ProjectsPage";

beforeEach(() => {
  // jsdom does not implement pseudo-element styles used by antd's scrollbar probe.
  const getComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  useAppStore.setState({ profiles: [], settings: null });
  vi.spyOn(api, "listProjects").mockResolvedValue([]);
  vi.spyOn(api, "listProfiles").mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("warns before closing a project changed by automatic CMake detection", async () => {
  vi.spyOn(api, "detectCmakeExecutable").mockResolvedValue("/usr/bin/cmake");
  const confirm = vi.spyOn(Modal, "confirm").mockReturnValue({ destroy: vi.fn(), update: vi.fn() });
  render(<ProjectsPage />);
  fireEvent.click(screen.getByRole("button", { name: /手动录入/ }));
  fireEvent.click(screen.getByRole("button", { name: "自动获取 CMake 位置" }));
  await waitFor(() => expect((screen.getByLabelText("CMake 可执行文件") as HTMLInputElement).value).toBe("/usr/bin/cmake"));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "放弃未保存的项目修改？" }));
});
