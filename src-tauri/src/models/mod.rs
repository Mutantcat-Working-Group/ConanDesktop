use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConanEnvironment {
    pub executable: Option<String>,
    pub version: Option<String>,
    pub conan_home: Option<String>,
    pub profiles_path: Option<String>,
    pub remotes_path: Option<String>,
    pub detected: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProfileState {
    Active,
    Inactive,
    Staged,
}

impl Default for ProfileState {
    fn default() -> Self {
        Self::Inactive
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub name: String,
    pub state: ProfileState,
    pub is_default: bool,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDetail {
    pub name: String,
    pub content: String,
    pub state: ProfileState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileValidation {
    pub valid: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSummary {
    pub name: String,
    pub url: String,
    pub verify_ssl: bool,
    pub enabled: bool,
    pub allowed_packages: Vec<String>,
    pub username: Option<String>,
    pub authenticated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnection {
    pub success: bool,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetection {
    pub path: String,
    pub name: String,
    pub conanfiles: Vec<String>,
    pub cmake_lists: Vec<String>,
    pub cmake_presets: Vec<String>,
    pub cmake_cache_files: Vec<String>,
    pub build_dirs: Vec<String>,
    pub cmake_executable: Option<String>,
    pub cmake_version: Option<String>,
    pub cmake_generator: Option<String>,
    pub cmake_build_type: Option<String>,
    pub cmake_source_dir: Option<String>,
    pub c_compiler: Option<String>,
    pub cxx_compiler: Option<String>,
    pub configure_presets: Vec<ConfigurePreset>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurePreset {
    pub name: String,
    pub display_name: String,
    pub generator: Option<String>,
    pub binary_dir: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub conan_profile: Option<String>,
    pub build_dir: Option<String>,
    pub cmake_executable: Option<String>,
    pub generator: Option<String>,
    pub arguments: Vec<String>,
    pub environment: HashMap<String, String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub conan_executable: Option<String>,
    pub default_project_dir: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            conan_executable: None,
            default_project_dir: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStates {
    pub states: HashMap<String, ProfileState>,
}

impl Default for ProfileStates {
    fn default() -> Self {
        Self {
            states: HashMap::new(),
        }
    }
}
