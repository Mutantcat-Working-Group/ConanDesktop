use crate::services::conan::{run_conan_json, validate_remote_name};
use serde_json::Value;
use tauri::AppHandle;

fn validate_package_pattern(pattern: &str) -> Result<(), String> {
    if pattern.trim().is_empty() {
        return Err("包查询条件不能为空。".to_string());
    }

    if pattern.starts_with('-') || pattern.contains(['\0', '\r', '\n']) {
        return Err("包查询条件包含非法字符。".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn search_packages(
    app: AppHandle,
    pattern: String,
    remote: String,
) -> Result<Value, String> {
    validate_package_pattern(&pattern)?;
    validate_remote_name(&remote)?;

    run_conan_json(
        &app,
        &[
            "list".into(),
            pattern,
            "-r".into(),
            remote,
            "--format".into(),
            "json".into(),
        ],
        "packages",
    )
    .await
}

#[tauri::command]
pub async fn get_package_details(
    app: AppHandle,
    reference: String,
    remote: String,
) -> Result<Value, String> {
    validate_package_pattern(&reference)?;
    validate_remote_name(&remote)?;
    let pattern = format!("{reference}#*:*");

    run_conan_json(
        &app,
        &[
            "list".into(),
            pattern,
            "-r".into(),
            remote,
            "--format".into(),
            "json".into(),
        ],
        "package-details",
    )
    .await
}
