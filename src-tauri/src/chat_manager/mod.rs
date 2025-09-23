mod commands;
mod request;
mod storage;
pub mod types;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

pub use commands::{
    __cmd__chat_completion,
    __cmd__chat_regenerate,
    __cmd__chat_continue,
    chat_completion,
    chat_regenerate,
    chat_continue,
};

fn emit_debug(app: &AppHandle, phase: &str, payload: Value) {
    let event = json!({
        "phase": phase,
        "payload": payload,
    });
    let _ = app.emit("chat://debug", event);
}
