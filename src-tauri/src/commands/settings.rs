use crate::models::AppSettings;
use crate::state::{read_settings, write_settings};
use tauri::AppHandle;

#[tauri::command]
pub async fn get_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    read_settings(&app)
}

#[tauri::command]
pub async fn save_app_settings(
    app: AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    write_settings(&app, &settings)?;
    Ok(settings)
}
