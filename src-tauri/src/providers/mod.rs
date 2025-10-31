//! Provider-facing utilities:
//! - `config`: public capabilities and defaults derived from adapters
//! - `verify`: provider API key verification helpers
//! This module should not duplicate adapter knowledge; derive from
//! `chat_manager::provider_adapter` wherever possible.
pub mod config;
pub mod verify;
mod util;

pub use config::*;
pub use verify::*;

