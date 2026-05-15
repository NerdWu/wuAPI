use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub enum RuntimeMode {
    Combined,   // GUI + Web Admin
    Standalone, // Web Admin only (no GUI/tray)
}

#[derive(Debug, Clone, Copy)]
pub enum ModeSource {
    Cli,
    Env,
    Auto,
}

pub fn detect_runtime_mode() -> (RuntimeMode, ModeSource) {
    // 1. Check CLI args: --headless, --nodisktop or --standalone
    let args: Vec<String> = std::env::args().collect();
    for arg in &args {
        if arg == "--headless" || arg == "--nodisktop" || arg == "--standalone" {
            return (RuntimeMode::Standalone, ModeSource::Cli);
        }
    }

    // 2. Check env vars. Keep legacy API_SWITCH_* names as aliases for compatibility.
    for key in [
        "WUAPI_HEADLESS",
        "WUAPI_STANDALONE",
        "API_SWITCH_HEADLESS",
        "API_SWITCH_STANDALONE",
    ] {
        if let Ok(val) = std::env::var(key) {
            if val == "1" || val.eq_ignore_ascii_case("true") {
                return (RuntimeMode::Standalone, ModeSource::Env);
            }
        }
    }

    // 3. Default: Combined
    (RuntimeMode::Combined, ModeSource::Auto)
}
