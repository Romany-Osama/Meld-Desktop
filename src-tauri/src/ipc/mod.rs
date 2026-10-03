//! Every command the webview can call, one module per owner (S5-003, docs/ipc-commands.md).
//! The command bodies still use helpers from `lib.rs`; those move into domain modules later.
pub mod account;
pub mod backup;
pub mod bindings;
pub mod cancel;
pub mod catalog;
#[cfg(test)]
mod contract;
pub mod downloads;
pub mod error;
pub mod library;
pub mod limits;
pub mod lyrics;
pub mod payload;
pub mod player;
pub mod settings;
pub mod spotify;
pub mod system;
