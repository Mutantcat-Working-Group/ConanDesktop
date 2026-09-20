use crate::models::{AppSettings, ProfileStates, ProjectConfig};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub static MUTATION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("无效文件路径")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temp.write_all(content).map_err(|error| error.to_string())?;
    temp.as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temp.persist(path)
        .map_err(|error| format!("保存 {} 失败: {error}", path.display()))?;
    Ok(())
}

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建应用数据目录: {error}"))?;
    Ok(dir)
}

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

pub fn profile_states_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("profile-states.json"))
}

pub fn projects_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("projects.json"))
}

fn read_json<T: DeserializeOwned + Default>(path: &Path) -> Result<T, String> {
    if !path.exists() {
        return Ok(T::default());
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("读取 {} 失败: {error}", path.display()))?;
    serde_json::from_str(&content).map_err(|error| format!("解析 {} 失败: {error}", path.display()))
}

fn write_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建目录 {}: {error}", parent.display()))?;
    }

    let content =
        serde_json::to_string_pretty(value).map_err(|error| format!("序列化配置失败: {error}"))?;
    atomic_write(path, content.as_bytes())
}

pub fn read_settings(app: &AppHandle) -> Result<AppSettings, String> {
    read_json(&settings_path(app)?)
}

pub fn write_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    write_json(&settings_path(app)?, settings)
}

pub fn read_profile_states(app: &AppHandle) -> Result<ProfileStates, String> {
    read_json(&profile_states_path(app)?)
}

pub fn write_profile_states(app: &AppHandle, states: &ProfileStates) -> Result<(), String> {
    write_json(&profile_states_path(app)?, states)
}

pub fn read_projects(app: &AppHandle) -> Result<Vec<ProjectConfig>, String> {
    read_json::<Vec<ProjectConfig>>(&projects_path(app)?)
}

pub fn write_projects(app: &AppHandle, projects: &[ProjectConfig]) -> Result<(), String> {
    write_json(&projects_path(app)?, projects)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_replaces_only_the_target() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("a.debug");
        let second = dir.path().join("a.release");
        atomic_write(&first, b"first").unwrap();
        atomic_write(&second, b"second").unwrap();
        atomic_write(&first, b"updated").unwrap();
        assert_eq!(fs::read_to_string(first).unwrap(), "updated");
        assert_eq!(fs::read_to_string(second).unwrap(), "second");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 2);
    }
}
