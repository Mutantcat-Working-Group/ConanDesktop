use crate::models::{RemoteConnection, RemoteSummary};
use crate::services::conan::{
    read_remote_list, resolve_conan_executable, run_conan_json, run_program, validate_remote_name,
    validate_remote_url,
};
use serde_json::Value;
use tauri::AppHandle;

fn remote_from_value(value: &Value) -> Result<RemoteSummary, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Conan remote 条目不是对象。".to_string())?;

    Ok(RemoteSummary {
        name: object
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| "Remote 缺少 name。".to_string())?
            .to_string(),
        url: object
            .get("url")
            .and_then(Value::as_str)
            .ok_or_else(|| "Remote 缺少 url。".to_string())?
            .to_string(),
        verify_ssl: object
            .get("verify_ssl")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        enabled: object
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        allowed_packages: object
            .get("allowed_packages")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        username: None,
        authenticated: None,
    })
}

#[tauri::command]
pub async fn list_remotes(app: AppHandle) -> Result<Vec<RemoteSummary>, String> {
    let values = read_remote_list(&app).await?;
    let mut remotes = values
        .iter()
        .map(remote_from_value)
        .collect::<Result<Vec<_>, _>>()?;
    if !remotes.is_empty() {
        // Cached credentials are optional metadata, not proof of server access.
        if let Ok(users) = run_conan_json(
            &app,
            &[
                "remote".into(),
                "list-users".into(),
                "--format".into(),
                "json".into(),
            ],
            "remote-users",
        )
        .await
        {
            merge_users(&mut remotes, &users);
        }
    }
    Ok(remotes)
}

fn merge_users(remotes: &mut [RemoteSummary], users: &Value) {
    if let Some(users) = users.as_array() {
        for remote in remotes {
            if let Some(user) = users
                .iter()
                .find(|user| user["name"].as_str() == Some(&remote.name))
            {
                remote.username = user["user_name"].as_str().map(str::to_string);
                remote.authenticated = user["authenticated"].as_bool();
            }
        }
    }
}

fn validate_probe(value: &Value, name: &str) -> Result<(), String> {
    let entries = value
        .get(name)
        .and_then(Value::as_object)
        .ok_or_else(|| "仓库返回了非预期的 Conan 查询结果。".to_string())?;
    if let Some(error) = entries.get("error") {
        return Err(error.as_str().unwrap_or("仓库查询失败。").to_string());
    }
    if entries
        .iter()
        .any(|(reference, recipe)| !reference.contains('/') || !recipe.is_object())
    {
        return Err("仓库返回了非预期的配方数据。".into());
    }
    Ok(())
}

fn failure_kind(error: &str) -> &'static str {
    let text = error.to_lowercase();
    if text.contains("certificate") || text.contains("sslerror") || text.contains("tls") {
        "tls"
    } else if text.contains("403")
        || text.contains("permission denied")
        || text.contains("forbidden")
    {
        "permission"
    } else if text.contains("401")
        || text.contains("authentication")
        || text.contains("credentials")
        || text.contains("password")
        || text.contains("not logged")
    {
        "authentication"
    } else if text.contains("404") || text.contains("not found") || text.contains("非预期") {
        "endpoint"
    } else if text.contains("connection")
        || text.contains("timeout")
        || text.contains("timed out")
        || text.contains("超时")
        || text.contains("resolve")
    {
        "network"
    } else {
        "unknown"
    }
}

#[tauri::command]
pub async fn check_remote(app: AppHandle, name: String) -> Result<RemoteConnection, String> {
    validate_remote_name(&name)?;
    let remotes = read_remote_list(&app).await?;
    let remote = remotes
        .iter()
        .find(|remote| remote["name"].as_str() == Some(&name))
        .ok_or_else(|| "仓库不存在，请刷新列表。".to_string())?;
    if remote["enabled"].as_bool() == Some(false) {
        return Ok(RemoteConnection {
            success: false,
            kind: "disabled".into(),
            message: "仓库已禁用。".into(),
        });
    }
    // A scoped wildcard exercises Conan's search API without enumerating the entire repository.
    let result = run_conan_json(
        &app,
        &[
            "list".into(),
            "conan-desktop-connectivity-probe-*".into(),
            "-r".into(),
            name.clone(),
            "--format".into(),
            "json".into(),
        ],
        "remote-check",
    )
    .await
    .and_then(|value| validate_probe(&value, &name));
    Ok(match result {
        Ok(()) => RemoteConnection {
            success: true,
            kind: "ok".into(),
            message: "Conan 只读查询成功。".into(),
        },
        Err(error) => RemoteConnection {
            success: false,
            kind: failure_kind(&error).into(),
            message: error,
        },
    })
}

#[tauri::command]
pub async fn add_remote(
    app: AppHandle,
    name: String,
    url: String,
    verify_ssl: bool,
) -> Result<(), String> {
    validate_remote_name(&name)?;
    validate_remote_url(&url)?;
    let executable = resolve_conan_executable(&app).await?;
    let mut args = vec!["remote".into(), "add".into(), name, url];

    if !verify_ssl {
        args.push("--insecure".into());
    }

    let output = run_program(&executable, &args, None, &[]).await?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn update_remote(
    app: AppHandle,
    name: String,
    url: String,
    verify_ssl: bool,
) -> Result<(), String> {
    validate_remote_name(&name)?;
    validate_remote_url(&url)?;
    let executable = resolve_conan_executable(&app).await?;
    let mut args = vec!["remote".into(), "update".into(), name, "--url".into(), url];

    args.push(if verify_ssl {
        "--secure".into()
    } else {
        "--insecure".into()
    });

    let output = run_program(&executable, &args, None, &[]).await?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_remote(app: AppHandle, name: String) -> Result<(), String> {
    validate_remote_name(&name)?;
    let executable = resolve_conan_executable(&app).await?;
    let output = run_program(
        &executable,
        &["remote".into(), "remove".into(), name],
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
pub async fn set_remote_enabled(app: AppHandle, name: String, enabled: bool) -> Result<(), String> {
    validate_remote_name(&name)?;
    let executable = resolve_conan_executable(&app).await?;
    let subcommand = if enabled { "enable" } else { "disable" };
    let output = run_program(
        &executable,
        &["remote".into(), subcommand.into(), name],
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
pub async fn rename_remote(
    app: AppHandle,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    validate_remote_name(&old_name)?;
    validate_remote_name(&new_name)?;
    let executable = resolve_conan_executable(&app).await?;
    let output = run_program(
        &executable,
        &["remote".into(), "rename".into(), old_name, new_name],
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
pub async fn login_remote(
    app: AppHandle,
    name: String,
    username: String,
    password: Option<String>,
) -> Result<(), String> {
    validate_remote_name(&name)?;
    let executable = resolve_conan_executable(&app).await?;
    let args = vec![
        "remote".into(),
        "login".into(),
        name.clone(),
        username,
        "-cc".into(),
        "core:non_interactive=True".into(),
    ];
    let password_key = format!("CONAN_PASSWORD_{}", name.to_uppercase().replace('-', "_"));
    let credentials = password
        .as_deref()
        .map(|value| vec![(password_key.as_str(), value)])
        .unwrap_or_default();
    let output = run_program(&executable, &args, None, &credentials).await?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn logout_remote(app: AppHandle, name: String) -> Result<(), String> {
    validate_remote_name(&name)?;
    let executable = resolve_conan_executable(&app).await?;
    let output = run_program(
        &executable,
        &["remote".into(), "logout".into(), name],
        None,
        &[],
    )
    .await?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn probe_requires_remote_object_and_rejects_embedded_errors() {
        assert!(validate_probe(&json!({"private": {}}), "private").is_ok());
        assert!(
            validate_probe(&json!({"private": {"engine/2@team/stable": {}}}), "private").is_ok()
        );
        for value in [
            json!({}),
            json!({"other": {}}),
            json!({"private": []}),
            json!({"private": {"error": "401 Unauthorized"}}),
            json!({"private": {"unexpected": true}}),
        ] {
            assert!(validate_probe(&value, "private").is_err());
        }
    }

    #[test]
    fn merges_cached_users_by_name_and_preserves_unknown_status() {
        let mut remotes =
            vec![
                remote_from_value(&json!({"name": "private", "url": "https://repo.internal"}))
                    .unwrap(),
            ];
        merge_users(&mut remotes, &json!({}));
        assert_eq!(remotes[0].authenticated, None);
        merge_users(
            &mut remotes,
            &json!([{"name": "other", "authenticated": false}, {"name": "private", "user_name": "tester", "authenticated": true}]),
        );
        assert_eq!(remotes[0].authenticated, Some(true));
        assert_eq!(remotes[0].username.as_deref(), Some("tester"));
    }

    #[test]
    fn connection_failures_have_actionable_categories() {
        for (error, kind) in [
            ("SSLError certificate verify failed", "tls"),
            ("403 Forbidden", "permission"),
            ("401 Unauthorized", "authentication"),
            ("Authentication failed", "authentication"),
            ("404 Not Found", "endpoint"),
            ("Connection refused", "network"),
            ("执行超时", "network"),
            ("unexpected output", "unknown"),
        ] {
            assert_eq!(failure_kind(error), kind);
        }
    }
}
