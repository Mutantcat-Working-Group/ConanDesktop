use crate::models::{
    ProfileDetail, ProfileState, ProfileStates, ProfileSummary, ProfileValidation,
};
use crate::services::conan::{
    conan_profiles_dir, resolve_conan_executable, run_conan_json, run_program,
    validate_profile_name,
};
use crate::state::{
    atomic_write, read_profile_states, read_projects, write_profile_states, MUTATION_LOCK,
};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

async fn profile_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    validate_profile_name(name)?;
    Ok(conan_profiles_dir(app).await?.join(name))
}

pub(crate) fn default_state_for(states: &ProfileStates, name: &str) -> ProfileState {
    states.states.get(name).cloned().unwrap_or_else(|| {
        if name == "default" {
            ProfileState::Active
        } else {
            ProfileState::Inactive
        }
    })
}

#[tauri::command]
pub async fn list_profiles(app: AppHandle) -> Result<Vec<ProfileSummary>, String> {
    let value = run_conan_json(
        &app,
        &[
            "profile".into(),
            "list".into(),
            "--format".into(),
            "json".into(),
        ],
        "profiles",
    )
    .await?;
    let names = value
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .map(|item| item.as_str().map(str::to_string))
                .collect::<Option<Vec<_>>>()
        })
        .ok_or_else(|| "Conan profile list 返回了非预期 JSON。".to_string())?;

    let states = read_profile_states(&app)?;
    let mut profiles = Vec::new();

    for name in names {
        let path = profile_path(&app, &name).await?;
        let metadata = fs::metadata(&path).ok();
        let modified_at = metadata
            .as_ref()
            .and_then(|item| item.modified().ok())
            .map(DateTime::<Utc>::from)
            .map(|time| time.to_rfc3339());

        profiles.push(ProfileSummary {
            is_default: name == "default",
            state: default_state_for(&states, &name),
            name,
            size_bytes: metadata.map(|item| item.len()).unwrap_or(0),
            modified_at,
        });
    }

    Ok(profiles)
}

#[tauri::command]
pub async fn get_profile(app: AppHandle, name: String) -> Result<ProfileDetail, String> {
    let path = profile_path(&app, &name).await?;
    let content =
        fs::read_to_string(&path).map_err(|error| format!("读取 profile {name} 失败: {error}"))?;
    let states = read_profile_states(&app)?;

    Ok(ProfileDetail {
        state: default_state_for(&states, &name),
        name,
        content,
    })
}

#[tauri::command]
pub async fn save_profile(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = profile_path(&app, &name).await?;
    let parent = path
        .parent()
        .ok_or_else(|| "Profile 路径无效。".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("创建 profile 目录失败: {error}"))?;

    atomic_write(&path, content.as_bytes())
}

#[tauri::command]
pub async fn create_profile(app: AppHandle, name: String) -> Result<(), String> {
    let _guard = MUTATION_LOCK.lock().await;
    let path = profile_path(&app, &name).await?;
    if path.exists() {
        return Err(format!("Profile {name} 已存在。"));
    }

    let skeleton = "[settings]\narch=\nbuild_type=Release\ncompiler=\ncompiler.version=\nos=\n";
    save_profile(app, name, skeleton.to_string()).await
}

#[tauri::command]
pub async fn detect_profile(app: AppHandle, name: String) -> Result<(), String> {
    validate_profile_name(&name)?;
    let executable = resolve_conan_executable(&app).await?;
    let output = run_program(
        &executable,
        &["profile".into(), "detect".into(), "--name".into(), name],
        None,
        &[],
    )
    .await?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn rename_profile(
    app: AppHandle,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let _guard = MUTATION_LOCK.lock().await;
    ensure_profile_unused(&app, &old_name)?;
    validate_profile_name(&new_name)?;
    let old_path = profile_path(&app, &old_name).await?;
    let new_path = profile_path(&app, &new_name).await?;

    if !old_path.exists() {
        return Err(format!("Profile {old_name} 不存在。"));
    }
    if new_path.exists() {
        return Err(format!("Profile {new_name} 已存在。"));
    }

    fs::rename(&old_path, &new_path).map_err(|error| format!("重命名 profile 失败: {error}"))?;

    let mut states = read_profile_states(&app)?;
    if let Some(state) = states.states.remove(&old_name) {
        states.states.insert(new_name, state);
    }
    write_profile_states(&app, &states)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_profile(app: AppHandle, name: String) -> Result<(), String> {
    let _guard = MUTATION_LOCK.lock().await;
    ensure_profile_unused(&app, &name)?;
    let path = profile_path(&app, &name).await?;
    if !path.exists() {
        return Err(format!("Profile {name} 不存在。"));
    }

    fs::remove_file(&path).map_err(|error| format!("删除 profile 失败: {error}"))?;

    let mut states = read_profile_states(&app)?;
    states.states.remove(&name);
    write_profile_states(&app, &states)?;
    Ok(())
}

#[tauri::command]
pub async fn validate_profile(app: AppHandle, name: String) -> Result<ProfileValidation, String> {
    let path = profile_path(&app, &name).await?;
    let value = run_conan_json(
        &app,
        &[
            "profile".into(),
            "show".into(),
            "-pr:h".into(),
            path.to_string_lossy().to_string(),
            "-pr:b".into(),
            path.to_string_lossy().to_string(),
            "--format".into(),
            "json".into(),
        ],
        "profile-validate",
    )
    .await;

    match value {
        Ok(_) => Ok(ProfileValidation {
            valid: true,
            message: "Profile 语法有效。".to_string(),
        }),
        Err(error) => Ok(ProfileValidation {
            valid: false,
            message: error,
        }),
    }
}

#[tauri::command]
pub async fn get_profile_states(app: AppHandle) -> Result<HashMap<String, ProfileState>, String> {
    Ok(read_profile_states(&app)?.states)
}

#[tauri::command]
pub async fn set_profile_state(
    app: AppHandle,
    name: String,
    state: ProfileState,
) -> Result<(), String> {
    let _guard = MUTATION_LOCK.lock().await;
    if !profile_path(&app, &name).await?.is_file() {
        return Err("Profile 不存在。".into());
    }
    if state != ProfileState::Active {
        ensure_profile_unused(&app, &name)?;
    }
    let mut states = read_profile_states(&app)?;
    states.states.insert(name, state);
    write_profile_states(&app, &states)
}

fn ensure_profile_unused(app: &AppHandle, name: &str) -> Result<(), String> {
    let users: Vec<String> = read_projects(app)?
        .into_iter()
        .filter(|project| project.conan_profile.as_deref() == Some(name))
        .map(|project| project.name)
        .collect();
    if users.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Profile 被项目 {} 使用，请先解除绑定。",
            users.join("、")
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_default_state_is_respected() {
        let mut states = ProfileStates::default();
        states.states.insert("default".into(), ProfileState::Staged);
        assert_eq!(default_state_for(&states, "default"), ProfileState::Staged);
    }
}
