use crate::models::ConanEnvironment;
use crate::services::conan::{conan_home, resolve_conan_executable, run_program};
use tauri::AppHandle;

#[tauri::command]
pub async fn detect_conan_environment(app: AppHandle) -> Result<ConanEnvironment, String> {
    let executable = resolve_conan_executable(&app).await.ok();

    let mut environment = ConanEnvironment {
        executable: executable.clone(),
        version: None,
        conan_home: None,
        profiles_path: None,
        remotes_path: None,
        detected: false,
        error: None,
    };

    let executable = match executable {
        Some(path) => path,
        None => {
            environment.error = Some("未找到 conan 可执行文件。".to_string());
            return Ok(environment);
        }
    };

    let version_output = run_program(&executable, &["--version".into()], None, &[]).await?;
    if !version_output.status.success() {
        environment.error = Some(
            String::from_utf8_lossy(&version_output.stderr)
                .trim()
                .to_string(),
        );
        return Ok(environment);
    }

    environment.version = Some(
        String::from_utf8_lossy(&version_output.stdout)
            .trim()
            .to_string(),
    );

    let home = conan_home(&app).await?;
    environment.conan_home = Some(home.to_string_lossy().to_string());
    environment.profiles_path = Some(home.join("profiles").to_string_lossy().to_string());
    environment.remotes_path = Some(home.join("remotes.json").to_string_lossy().to_string());
    environment.detected = true;

    Ok(environment)
}
