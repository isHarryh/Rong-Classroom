use std::fs;

fn main() {
    let config = fs::read_to_string("../app.config.json").unwrap_or_else(|error| {
        panic!("failed to read desktop/app.config.json: {error}");
    });
    let origin = serde_json::from_str::<serde_json::Value>(&config)
        .ok()
        .and_then(|value| {
            value
                .get("serverOrigin")
                .and_then(|origin| origin.as_str())
                .map(|origin| origin.trim_end_matches('/').to_string())
        })
        .filter(|origin| !origin.is_empty())
        .unwrap_or_else(|| {
            panic!("desktop/app.config.json must contain a non-empty string field \"serverOrigin\"")
        });
    println!("cargo:rustc-env=RONG_SERVER_ORIGIN={origin}");
    println!("cargo:rerun-if-changed=../app.config.json");
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build();
}
