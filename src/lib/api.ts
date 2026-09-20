import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  ConanEnvironment,
  ProfileDetail,
  ProfileState,
  ProfileStateMap,
  ProfileSummary,
  ProfileValidation,
  ProjectConfig,
  ProjectDetection,
  RemoteSummary,
  RemoteConnection,
} from "./types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type InvokeArgs = Record<string, unknown>;

async function call<T>(
  command: string,
  args?: InvokeArgs,
  fallback?: () => T,
): Promise<T> {
  if (isTauriRuntime()) {
    return invoke<T>(command, args);
  }

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1" && fallback) {
    return Promise.resolve(fallback());
  }

  throw new Error("当前为浏览器预览。请启动 Tauri 桌面应用以连接本地 Conan。");
}

export const api = {
  isTauriRuntime,

  detectConanEnvironment() {
    return call<ConanEnvironment>("detect_conan_environment", undefined, () => ({
      executable: "/opt/homebrew/bin/conan",
      version: "Conan version 2.16.1 (demo)",
      conanHome: "/Users/tyza66/.conan2",
      profilesPath: "/Users/tyza66/.conan2/profiles",
      remotesPath: "/Users/tyza66/.conan2/remotes.json",
      detected: true,
      error: null,
    }));
  },

  getAppSettings() {
    return call<AppSettings>("get_app_settings", undefined, () => ({
      conanExecutable: "/opt/homebrew/bin/conan",
      defaultProjectDir: null,
    }));
  },

  saveAppSettings(settings: AppSettings) {
    return call<AppSettings>(
      "save_app_settings",
      { settings } as InvokeArgs,
    );
  },

  listProfiles() {
    return call<ProfileSummary[]>("list_profiles", undefined, () => [
      {
        name: "default",
        state: "active",
        isDefault: true,
        sizeBytes: 1832,
        modifiedAt: new Date().toISOString(),
      },
      {
        name: "release",
        state: "staged",
        isDefault: false,
        sizeBytes: 1240,
        modifiedAt: new Date(Date.now() - 3600_000).toISOString(),
      },
      {
        name: "debug",
        state: "inactive",
        isDefault: false,
        sizeBytes: 1104,
        modifiedAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ]);
  },

  getProfile(name: string) {
    return call<ProfileDetail>(
      "get_profile",
      { name },
      () => ({
        name,
        state: name === "default" ? "active" : name === "release" ? "staged" : "inactive",
        content:
          "[settings]\narch=armv8\nbuild_type=Release\ncompiler=apple-clang\ncompiler.version=17\nos=Macos\n\n[options]\nshared=True\n",
      }),
    );
  },

  saveProfile(name: string, content: string) {
    return call<void>("save_profile", { name, content });
  },

  createProfile(name: string) {
    return call<void>("create_profile", { name });
  },

  detectProfile(name: string) {
    return call<void>("detect_profile", { name });
  },

  renameProfile(oldName: string, newName: string) {
    return call<void>("rename_profile", { oldName, newName });
  },

  deleteProfile(name: string) {
    return call<void>("delete_profile", { name });
  },

  validateProfile(name: string) {
    return call<ProfileValidation>("validate_profile", { name }, () => ({
      valid: true,
      message: "Profile 语法有效（浏览器演示模式）。",
    }));
  },

  getProfileStates() {
    return call<ProfileStateMap>("get_profile_states", undefined, () => ({}));
  },

  setProfileState(name: string, state: ProfileState) {
    return call<void>("set_profile_state", { name, state });
  },

  listRemotes() {
    return call<RemoteSummary[]>("list_remotes", undefined, () => [
      {
        name: "conancenter",
        url: "https://center2.conan.io",
        verifySsl: true,
        enabled: true,
        allowedPackages: [],
      },
    ]);
  },

  addRemote(name: string, url: string, verifySsl: boolean) {
    return call<void>("add_remote", { name, url, verifySsl });
  },

  checkRemote(name: string) {
    return call<RemoteConnection>("check_remote", { name });
  },

  updateRemote(name: string, url: string, verifySsl: boolean) {
    return call<void>("update_remote", { name, url, verifySsl });
  },

  removeRemote(name: string) {
    return call<void>("remove_remote", { name });
  },

  setRemoteEnabled(name: string, enabled: boolean) {
    return call<void>("set_remote_enabled", { name, enabled });
  },

  renameRemote(oldName: string, newName: string) {
    return call<void>("rename_remote", { oldName, newName });
  },

  loginRemote(name: string, username: string, password?: string) {
    return call<void>("login_remote", { name, username, password });
  },

  logoutRemote(name: string) {
    return call<void>("logout_remote", { name });
  },

  searchPackages(pattern: string, remote: string) {
    return call<unknown>(
      "search_packages",
      { pattern, remote },
      () => mockPackageSearch(pattern, remote),
    );
  },

  getPackageDetails(reference: string, remote: string) {
    return call<unknown>(
      "get_package_details",
      { reference, remote },
      () => mockPackageDetails(reference, remote),
    );
  },

  detectProject(path: string) {
    return call<ProjectDetection>(
      "detect_project",
      { path },
      () => ({
        path,
        name: path.split(/[\\/]/).filter(Boolean).pop() || "untitled-project",
        conanfiles: [`${path}/conanfile.py`],
        cmakeLists: [`${path}/CMakeLists.txt`],
        cmakePresets: [`${path}/CMakePresets.json`],
        cmakeCacheFiles: [`${path}/build/CMakeCache.txt`],
        buildDirs: [`${path}/build`],
        cmakeExecutable: "/opt/homebrew/bin/cmake",
        cmakeVersion: "cmake version 3.31.6 (demo)",
        cmakeGenerator: "Ninja",
        cmakeBuildType: "Release",
        cmakeSourceDir: path,
        cCompiler: "/usr/bin/clang",
        cxxCompiler: "/usr/bin/clang++",
        configurePresets: [{ name: "release", displayName: "Release", generator: "Ninja", binaryDir: `${path}/build/release`, source: `${path}/CMakePresets.json` }],
        warnings: [],
      }),
    );
  },

  detectCmakeExecutable() {
    return call<string | null>(
      "detect_cmake_executable",
      undefined,
      () => "/opt/homebrew/bin/cmake",
    );
  },

  listProjects() {
    return call<ProjectConfig[]>("list_projects", undefined, () => []);
  },

  saveProject(project: ProjectConfig) {
    return call<ProjectConfig>(
      "save_project",
      { project },
    );
  },

  deleteProject(id: string) {
    return call<void>("delete_project", { id });
  },
};

function mockPackageSearch(pattern: string, remote: string): unknown {
  const references = ["fmt/12.2.0", "zlib/1.3.1", "openssl/3.5.0"];
  const object: Record<string, Record<string, unknown>> = {
    [remote]: {},
  };

  for (const reference of references) {
    if (!pattern || pattern === "*" || reference.includes(pattern.replace(/\*/g, ""))) {
      object[remote][reference] = {};
    }
  }

  return object;
}

function mockPackageDetails(reference: string, remote: string): unknown {
  return {
    [remote]: {
      [reference]: {
        revisions: {
          demo: {
            timestamp: Date.now() / 1000,
            packages: {
              packageA: {
                info: {
                  settings: {
                    arch: "armv8",
                    build_type: "Release",
                    compiler: "apple-clang",
                    os: "Macos",
                  },
                  options: { shared: "True" },
                },
              },
              packageB: {
                info: {
                  settings: {
                    arch: "x86_64",
                    build_type: "Release",
                    compiler: "gcc",
                    os: "Linux",
                  },
                  options: { shared: "False" },
                },
              },
            },
          },
        },
      },
    },
  };
}
