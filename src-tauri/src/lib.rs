mod commands;
mod models;
mod services;
mod state;

use commands::{
    environment::detect_conan_environment,
    packages::{get_package_details, search_packages},
    profiles::{
        create_profile, delete_profile, detect_profile, get_profile, get_profile_states,
        list_profiles, rename_profile, save_profile, set_profile_state, validate_profile,
    },
    projects::{
        delete_project, detect_cmake_executable, detect_project, list_projects, save_project,
    },
    remotes::{
        add_remote, check_remote, list_remotes, login_remote, logout_remote, remove_remote,
        rename_remote, set_remote_enabled, update_remote,
    },
    settings::{get_app_settings, save_app_settings},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_conan_environment,
            get_app_settings,
            save_app_settings,
            list_profiles,
            get_profile,
            save_profile,
            create_profile,
            detect_profile,
            rename_profile,
            delete_profile,
            validate_profile,
            get_profile_states,
            set_profile_state,
            list_remotes,
            check_remote,
            add_remote,
            update_remote,
            remove_remote,
            set_remote_enabled,
            rename_remote,
            login_remote,
            logout_remote,
            search_packages,
            get_package_details,
            detect_project,
            detect_cmake_executable,
            list_projects,
            save_project,
            delete_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
