export type ProfileState = "active" | "inactive" | "staged";

export interface ConanEnvironment {
  executable: string | null;
  version: string | null;
  conanHome: string | null;
  profilesPath: string | null;
  remotesPath: string | null;
  detected: boolean;
  error: string | null;
}

export interface ProfileSummary {
  name: string;
  state: ProfileState;
  isDefault: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
}

export interface ProfileDetail {
  name: string;
  content: string;
  state: ProfileState;
}

export interface ProfileValidation {
  valid: boolean;
  message: string;
}

export interface RemoteSummary {
  name: string;
  url: string;
  verifySsl: boolean;
  enabled: boolean;
  allowedPackages: string[];
  username?: string | null;
  authenticated?: boolean | null;
}

export interface RemoteConnection {
  success: boolean;
  kind: "ok" | "disabled" | "authentication" | "permission" | "tls" | "endpoint" | "network" | "unknown";
  message: string;
}

export interface ProjectDetection {
  path: string;
  name: string;
  conanfiles: string[];
  cmakeLists: string[];
  cmakePresets: string[];
  cmakeCacheFiles: string[];
  buildDirs: string[];
  cmakeExecutable: string | null;
  cmakeVersion: string | null;
  cmakeGenerator: string | null;
  cmakeBuildType: string | null;
  cmakeSourceDir: string | null;
  cCompiler: string | null;
  cxxCompiler: string | null;
  configurePresets: { name: string; displayName: string; generator: string | null; binaryDir: string | null; source: string }[];
  warnings: string[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  conanProfile: string | null;
  buildDir: string | null;
  cmakeExecutable: string | null;
  generator: string | null;
  arguments: string[];
  environment: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  conanExecutable: string | null;
  defaultProjectDir: string | null;
}

export interface ProfileStateMap {
  [name: string]: ProfileState;
}

export interface PackageRow {
  reference: string;
  name: string;
  version: string;
  remote: string;
}

export interface PackageRevision {
  id: string;
  timestamp: string | null;
  packageCount: number;
}

export interface PackageDetail {
  reference: string;
  remote: string;
  revisions: PackageRevision[];
}
