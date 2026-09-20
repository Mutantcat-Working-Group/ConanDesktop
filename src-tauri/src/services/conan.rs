use crate::state::read_settings;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::time::Duration;
use tauri::AppHandle;
use url::Url;

pub async fn run_program(
    program: &str,
    args: &[String],
    cwd: Option<&Path>,
    environment: &[(&str, &str)],
) -> Result<Output, String> {
    let mut command = tokio::process::Command::new(program);
    command.args(args).kill_on_drop(true).stdin(Stdio::null());

    if let Some(directory) = cwd {
        command.current_dir(directory);
    }

    for (key, value) in environment {
        command.env(key, value);
    }

    tokio::time::timeout(Duration::from_secs(90), command.output())
        .await
        .map_err(|_| format!("执行 {program} 超时（90 秒）。"))?
        .map_err(|error| format!("执行 {program} 失败: {error}"))
}

pub fn find_executable(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let extensions = if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".to_string())
            .split(';')
            .filter(|extension| !extension.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>()
    } else {
        vec![String::new()]
    };

    let mut directories: Vec<PathBuf> = std::env::split_paths(&path).collect();
    if cfg!(target_os = "macos") {
        directories.extend(
            [
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/Applications/CMake.app/Contents/bin",
            ]
            .map(PathBuf::from),
        );
    }
    if let Some(home) = std::env::var_os("HOME") {
        directories.push(PathBuf::from(home).join(".local/bin"));
    }
    for directory in directories {
        for extension in &extensions {
            let candidate = directory.join(format!("{name}{extension}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
}

pub async fn resolve_conan_executable(app: &AppHandle) -> Result<String, String> {
    if let Some(configured) = read_settings(app)?.conan_executable {
        if !configured.trim().is_empty() {
            return Ok(configured);
        }
    }

    find_executable("conan")
        .map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| "未找到 conan 可执行文件，请在设置中指定路径。".to_string())
}

pub fn validate_profile_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.starts_with('-')
        || name == "."
        || name == ".."
        || name.contains(['/', '\\'])
    {
        return Err("Profile 名称不能为空或包含路径分隔符。".to_string());
    }

    let safe = name
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.'));
    if !safe {
        return Err("Profile 名称只能包含字母、数字、点、下划线和连字符。".to_string());
    }

    Ok(())
}

pub fn validate_remote_name(name: &str) -> Result<(), String> {
    validate_profile_name(name)
}

pub fn validate_remote_url(value: &str) -> Result<(), String> {
    let url = Url::parse(value).map_err(|error| format!("Remote URL 无效: {error}"))?;

    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("仓库地址不能包含账号、密码、查询参数或片段，请通过登录配置凭据。".into());
    }

    match url.scheme() {
        "https" | "http" | "file" => {}
        _ => return Err("Remote URL 仅支持 https、http 或 file 协议。".to_string()),
    }

    if url.host_str().is_none() && url.scheme() != "file" {
        return Err("Remote URL 缺少有效主机名。".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_remote_url;

    #[test]
    fn private_urls_preserve_ports_and_paths_but_reject_secrets() {
        for url in [
            "https://repo.internal:8443/artifactory/api/conan/team",
            "http://127.0.0.1:9300",
            "file:///tmp/recipes",
        ] {
            assert!(validate_remote_url(url).is_ok());
        }
        for url in [
            "https://user:secret@repo.internal",
            "https://repo.internal?token=secret",
            "https://repo.internal/#secret",
        ] {
            assert!(validate_remote_url(url).is_err());
        }
    }
}

pub async fn run_conan_json(
    app: &AppHandle,
    args: &[String],
    prefix: &str,
) -> Result<Value, String> {
    let executable = resolve_conan_executable(app).await?;
    let output_dir = tempfile::Builder::new()
        .prefix("conan-desktop-")
        .tempdir()
        .map_err(|error| error.to_string())?;
    let output_path = output_dir.path().join(format!("{prefix}.json"));

    let mut full_args = args.to_vec();
    full_args.extend(["-cc".to_string(), "core:non_interactive=True".to_string()]);
    full_args.push("--out-file".to_string());
    full_args.push(output_path.to_string_lossy().to_string());

    let output = run_program(&executable, &full_args, None, &[]).await?;
    if !output.status.success() {
        let _ = fs::remove_file(&output_path);
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let content = fs::read_to_string(&output_path)
        .map_err(|error| format!("读取 Conan JSON 输出失败: {error}"))?;
    let _ = fs::remove_file(&output_path);

    serde_json::from_str(&content).map_err(|error| format!("解析 Conan JSON 输出失败: {error}"))
}

pub async fn conan_home(app: &AppHandle) -> Result<PathBuf, String> {
    let executable = resolve_conan_executable(app).await?;
    let output = run_program(&executable, &["config".into(), "home".into()], None, &[]).await?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err("Conan 未返回 CONAN_HOME。".to_string());
    }

    Ok(PathBuf::from(path))
}

pub async fn conan_profiles_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(conan_home(app).await?.join("profiles"))
}

pub async fn read_remote_list(app: &AppHandle) -> Result<Vec<Value>, String> {
    let value = run_conan_json(
        app,
        &[
            "remote".into(),
            "list".into(),
            "--format".into(),
            "json".into(),
        ],
        "remotes",
    )
    .await?;

    value
        .as_array()
        .cloned()
        .ok_or_else(|| "Conan remote list 返回了非数组 JSON。".to_string())
}
