use crate::commands::profiles::default_state_for;
use crate::models::{ConfigurePreset, ProfileState, ProjectConfig, ProjectDetection};
use crate::services::conan::{
    conan_profiles_dir, find_executable, run_program, validate_profile_name,
};
use crate::state::{read_profile_states, read_projects, write_projects, MUTATION_LOCK};
use chrono::Utc;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use walkdir::WalkDir;

fn project_name_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|item| item.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("untitled-project")
        .to_string()
}

fn parse_cmake_cache(content: &str) -> HashMap<String, String> {
    content
        .lines()
        .filter_map(|line| {
            let capture = line.split_once(':')?;
            let key = capture.0;
            let rest = capture.1.split_once('=')?;
            if key
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
            {
                Some((key.to_string(), rest.1.to_string()))
            } else {
                None
            }
        })
        .collect()
}

fn scan_project_files(root: &Path) -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
    let mut conanfiles = Vec::new();
    let mut cmake_lists = Vec::new();
    let mut cmake_presets = Vec::new();
    let mut cmake_cache_files = Vec::new();

    for entry in WalkDir::new(root)
        .max_depth(6)
        .sort_by_file_name()
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            !matches!(
                entry.file_name().to_str(),
                Some(".git" | "node_modules" | ".venv" | "venv" | "target" | "_deps")
            )
        })
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy();
        match file_name.as_ref() {
            "conanfile.py" | "conanfile.txt" => {
                conanfiles.push(entry.path().to_string_lossy().to_string())
            }
            "CMakeLists.txt" => cmake_lists.push(entry.path().to_string_lossy().to_string()),
            "CMakePresets.json" | "CMakeUserPresets.json" => {
                cmake_presets.push(entry.path().to_string_lossy().to_string())
            }
            "CMakeCache.txt" => cmake_cache_files.push(entry.path().to_string_lossy().to_string()),
            _ => {}
        }
    }

    (conanfiles, cmake_lists, cmake_presets, cmake_cache_files)
}

fn build_dirs_from_cache_files(cache_files: &[String]) -> Vec<String> {
    cache_files
        .iter()
        .filter_map(|file| Path::new(file).parent())
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn read_first_cmake_cache(cache_files: &[String]) -> Option<String> {
    cache_files
        .iter()
        .find_map(|file| fs::read_to_string(file).ok())
}

fn read_presets(files: &[String]) -> (Vec<ConfigurePreset>, Vec<String>) {
    let mut presets = Vec::new();
    let mut warnings = Vec::new();
    for file in files {
        let parsed = fs::read_to_string(file)
            .map_err(|error| error.to_string())
            .and_then(|text| {
                serde_json::from_str::<serde_json::Value>(&text).map_err(|error| error.to_string())
            });
        let value = match parsed {
            Ok(value) => value,
            Err(error) => {
                warnings.push(format!("{file}: {error}"));
                continue;
            }
        };
        if value.get("include").is_some() {
            warnings.push(format!("{file}: 暂不展开 include，请核对预设路径。"));
        }
        let Some(items) = value
            .get("configurePresets")
            .and_then(|item| item.as_array())
        else {
            continue;
        };
        for item in items {
            if item.get("hidden").and_then(|value| value.as_bool()) == Some(true) {
                continue;
            }
            let Some(name) = item.get("name").and_then(|value| value.as_str()) else {
                continue;
            };
            let source_dir = Path::new(file).parent().unwrap_or(Path::new(""));
            let binary_dir = item
                .get("binaryDir")
                .and_then(|value| value.as_str())
                .and_then(|value| {
                    let value = value
                        .replace("${sourceDir}", &source_dir.to_string_lossy())
                        .replace("${presetName}", name);
                    if value.contains('$') {
                        return None;
                    }
                    let path = PathBuf::from(value);
                    Some(
                        if path.is_absolute() {
                            path
                        } else {
                            source_dir.join(path)
                        }
                        .to_string_lossy()
                        .to_string(),
                    )
                });
            if item.get("inherits").is_some() {
                warnings.push(format!("预设 {name}: 仅读取直接字段，继承字段请手动核对。"));
            }
            presets.push(ConfigurePreset {
                name: name.to_string(),
                display_name: item
                    .get("displayName")
                    .and_then(|value| value.as_str())
                    .unwrap_or(name)
                    .to_string(),
                generator: item
                    .get("generator")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                binary_dir,
                source: file.clone(),
            });
        }
    }
    (presets, warnings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_preserves_values_with_equals() {
        let cache = parse_cmake_cache(
            "//comment\nCMAKE_GENERATOR:INTERNAL=Ninja\nFLAGS:STRING=-DKEY=value\n# comment",
        );
        assert_eq!(cache.get("FLAGS").unwrap(), "-DKEY=value");
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn scanner_ignores_dependencies_and_finds_deep_builds() {
        let temp = tempfile::tempdir().unwrap();
        for path in [
            "node_modules/vendor",
            "build/macos/release/generators",
            ".git/vendor",
        ] {
            fs::create_dir_all(temp.path().join(path)).unwrap();
        }
        fs::write(temp.path().join("node_modules/vendor/conanfile.py"), "").unwrap();
        fs::write(
            temp.path()
                .join("build/macos/release/generators/CMakeCache.txt"),
            "",
        )
        .unwrap();
        fs::write(temp.path().join(".git/vendor/CMakeLists.txt"), "").unwrap();
        let (recipes, lists, _, caches) = scan_project_files(temp.path());
        assert!(recipes.is_empty());
        assert!(lists.is_empty());
        assert_eq!(caches.len(), 1);
    }

    #[test]
    fn presets_expand_supported_macros_and_report_partial_support() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("CMakePresets.json");
        fs::write(&file, r#"{"version":3,"include":["shared.json"],"configurePresets":[{"name":"base","hidden":true},{"name":"release","inherits":"base","generator":"Ninja","binaryDir":"${sourceDir}/build/${presetName}"},{"name":"env","binaryDir":"$env{BUILD_DIR}"}]}"#).unwrap();
        let (presets, warnings) = read_presets(&[file.to_string_lossy().to_string()]);
        assert_eq!(presets.len(), 2);
        assert_eq!(
            presets[0].binary_dir.as_ref().map(PathBuf::from),
            Some(temp.path().join("build/release"))
        );
        assert!(presets[1].binary_dir.is_none());
        assert_eq!(warnings.len(), 2);
    }
}

#[tauri::command]
pub async fn detect_project(_app: AppHandle, path: String) -> Result<ProjectDetection, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("项目路径不存在或不是目录。".to_string());
    }
    let root = root.canonicalize().map_err(|error| error.to_string())?;

    let (conanfiles, cmake_lists, cmake_presets, cmake_cache_files) = scan_project_files(&root);
    let mut build_dirs = build_dirs_from_cache_files(&cmake_cache_files);
    let (configure_presets, mut warnings) = read_presets(&cmake_presets);
    for preset in &configure_presets {
        if let Some(path) = &preset.binary_dir {
            if !build_dirs.contains(path) {
                build_dirs.push(path.clone());
            }
        }
    }
    if cmake_cache_files.len() > 1 {
        warnings.push("发现多个 CMakeCache，环境信息取排序后的首个文件。".into());
    }
    let cache_content = read_first_cmake_cache(&cmake_cache_files);
    let cache = cache_content
        .as_deref()
        .map(parse_cmake_cache)
        .unwrap_or_default();

    let cmake_executable = cache
        .get("CMAKE_COMMAND")
        .filter(|value| Path::new(value).is_file())
        .cloned()
        .or_else(|| find_executable("cmake").map(|item| item.to_string_lossy().to_string()));
    let mut cmake_version = None;

    // Cache contents are project-controlled; only execute a tool discovered in trusted search paths.
    let trusted_cmake = find_executable("cmake").map(|path| path.to_string_lossy().to_string());
    if let Some(executable) = cmake_executable
        .as_ref()
        .filter(|path| Some(*path) == trusted_cmake.as_ref())
    {
        if let Ok(output) = run_program(executable, &["--version".into()], None, &[]).await {
            if output.status.success() {
                cmake_version = Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
    }

    Ok(ProjectDetection {
        name: project_name_from_path(&root),
        path: root.to_string_lossy().to_string(),
        conanfiles,
        cmake_lists,
        cmake_presets,
        cmake_cache_files,
        build_dirs,
        cmake_executable,
        cmake_version,
        cmake_generator: cache.get("CMAKE_GENERATOR").cloned(),
        cmake_build_type: cache.get("CMAKE_BUILD_TYPE").cloned(),
        cmake_source_dir: cache.get("CMAKE_HOME_DIRECTORY").cloned(),
        c_compiler: cache.get("CMAKE_C_COMPILER").cloned(),
        cxx_compiler: cache.get("CMAKE_CXX_COMPILER").cloned(),
        configure_presets,
        warnings,
    })
}

#[tauri::command]
pub async fn detect_cmake_executable() -> Result<Option<String>, String> {
    Ok(find_executable("cmake").map(|item| item.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn list_projects(app: AppHandle) -> Result<Vec<ProjectConfig>, String> {
    read_projects(&app)
}

#[tauri::command]
pub async fn save_project(app: AppHandle, project: ProjectConfig) -> Result<ProjectConfig, String> {
    let _guard = MUTATION_LOCK.lock().await;
    if project.name.trim().is_empty() {
        return Err("项目名称不能为空。".into());
    }
    if !Path::new(&project.path).is_dir() {
        return Err("项目路径不存在或不是目录。".into());
    }
    if let Some(name) = &project.conan_profile {
        validate_profile_name(name)?;
        if !conan_profiles_dir(&app).await?.join(name).is_file() {
            return Err("绑定的 Profile 不存在。".into());
        }
        if default_state_for(&read_profile_states(&app)?, name) != ProfileState::Active {
            return Err("只能绑定生效状态的 Profile。".into());
        }
    }
    let mut projects = read_projects(&app)?;
    let now = Utc::now().to_rfc3339();
    let mut next = project;

    if next.id.trim().is_empty() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("系统时间异常: {error}"))?
            .as_nanos();
        next.id = format!("project-{timestamp}");
        next.created_at = now.clone();
    }

    next.updated_at = now;

    if let Some(existing) = projects.iter_mut().find(|item| item.id == next.id) {
        *existing = next.clone();
    } else {
        projects.push(next.clone());
    }

    write_projects(&app, &projects)?;
    Ok(next)
}

#[tauri::command]
pub async fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let _guard = MUTATION_LOCK.lock().await;
    let mut projects = read_projects(&app)?;
    let before = projects.len();
    projects.retain(|project| project.id != id);

    if projects.len() == before {
        return Err("未找到要删除的项目。".to_string());
    }

    write_projects(&app, &projects)
}
