//! IPC commands: app-wide plumbing (owner `system` in docs/ipc-commands.md).
#![allow(unused_imports)]

use crate::*;

/// Stops a command started with this `requestId` (S5-009). Unknown ids are remembered briefly,
/// in case the cancel overtakes the call it belongs to.
#[tauri::command]
pub fn request_cancel(request_id: Token) -> IpcResult<bool> {
    Ok(ipc::cancel::cancel_request(request_id.as_str()))
}
