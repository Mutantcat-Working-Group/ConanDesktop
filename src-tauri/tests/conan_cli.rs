use std::process::{Command, Output, Stdio};

fn conan(home: &std::path::Path, args: &[&str]) -> Output {
    let executable = std::env::var("CONAN_TEST_EXECUTABLE").unwrap_or_else(|_| "conan".into());
    let output = Command::new(executable)
        .env("CONAN_HOME", home)
        .args(args)
        .args(["-cc", "core:non_interactive=True"])
        .stdin(Stdio::null())
        .output()
        .expect("Conan 2 must be installed for the ignored integration test");
    assert!(
        output.status.success(),
        "{:?}: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
    output
}

#[test]
#[ignore = "Requires an installed Conan 2 executable; uses an isolated temporary CONAN_HOME"]
fn isolated_profile_remote_and_package_workflow() {
    let home = tempfile::tempdir().unwrap();
    let profile_list = conan(home.path(), &["profile", "list", "--format", "json"]);
    let profiles: serde_json::Value = serde_json::from_slice(&profile_list.stdout).unwrap();
    assert!(profiles.is_array());
    conan(home.path(), &["profile", "detect", "--name", "smoke"]);
    assert!(home.path().join("profiles/smoke").is_file());
    // Keep validation independent of the machine compiler and Conan's settings.yml age.
    std::fs::write(home.path().join("profiles/smoke"), "[settings]\nos=Linux\narch=x86_64\ncompiler=gcc\ncompiler.version=13\ncompiler.libcxx=libstdc++11\nbuild_type=Release\n").unwrap();
    conan(
        home.path(),
        &[
            "profile", "show", "-pr:h", "smoke", "-pr:b", "smoke", "--format", "json",
        ],
    );
    conan(
        home.path(),
        &["remote", "add", "smoke", "https://example.invalid"],
    );
    conan(
        home.path(),
        &[
            "remote",
            "update",
            "smoke",
            "--url",
            "https://example.invalid/v2",
            "--secure",
        ],
    );
    conan(home.path(), &["remote", "disable", "smoke"]);
    let output_file = home.path().join("remotes-output.json");
    conan(
        home.path(),
        &[
            "remote",
            "list",
            "--format",
            "json",
            "--out-file",
            output_file.to_str().unwrap(),
        ],
    );
    let value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output_file).unwrap()).unwrap();
    let remote = value
        .as_array()
        .unwrap()
        .iter()
        .find(|value| value["name"] == "smoke")
        .unwrap();
    assert_eq!(remote["enabled"], false);
    assert_eq!(remote["url"], "https://example.invalid/v2");
    conan(home.path(), &["remote", "rename", "smoke", "smoke-renamed"]);
    conan(home.path(), &["remote", "enable", "smoke-renamed"]);
    conan(home.path(), &["remote", "remove", "smoke-renamed"]);
    let packages = conan(home.path(), &["list", "*", "--format", "json"]);
    let packages: serde_json::Value = serde_json::from_slice(&packages.stdout).unwrap();
    assert!(packages["Local Cache"].is_object());
}
