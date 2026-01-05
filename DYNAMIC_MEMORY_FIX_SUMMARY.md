# Dynamic Memory Fix Summary - Group Chat Parity

## Overview
Fixed group chat dynamic memory system to match normal chat behavior: memory cycles now run only after N messages (not after every message), and message context sent to LLM respects the dynamic window size setting.

## Problems Fixed

### 1. Memory Cycles Running After Every Message
**Issue**: Group chat was calling `process_group_dynamic_memory_cycle` after every single message in `group_chat_send`, causing excessive summarization and memory updates.

**Expected**: Memory cycles should only run every N messages, where N is the `summary_message_interval` setting (e.g., every 20 messages).

**Fix**: Added proper gating logic that tracks `last_window_end` in `memory_tool_events` and only runs the cycle when `total_convo - last_window_end >= window_size`.

### 2. Wrong Gating Logic (Modulo Check)
**Issue**: Group chat used a simple modulo check (`total_convo % window_size != 0`) which doesn't properly track progress across sessions and can skip or double-run cycles.

**Expected**: Track the exact conversation count where the last cycle ended (like normal chat does) and run the next cycle when enough new messages have accumulated.

**Fix**: 
- Added `memory_tool_events: Vec<serde_json::Value>` field to `GroupSession` struct
- Changed gating logic to match normal chat:
  - Extract `last_window_end` from the last memory_tool_event
  - Check if `total_convo <= last_window_end` (skip if no new messages)
  - Check if `total_convo - last_window_end < window_size` (skip if not enough new messages)
- Record `windowEnd: total_convo` in memory_tool_events after each successful cycle

### 3. Sending All Messages to LLM (Not Respecting Window Size)
**Issue**: In `generate_character_response`, all `context.recent_messages` were being sent to the LLM, ignoring the `dynamic_window_size` setting for dynamic memory mode.

**Expected**: When dynamic memory is enabled, only the last N messages (where N = `dynamic_window_size`) should be sent to the LLM, since older context is captured in memory embeddings and summary.

**Fix**: Applied `conversation_window()` filtering before building messages for API:
```rust
let messages_for_generation = if is_dynamic_memory_enabled(settings) {
    let window_size = dynamic_window_size(settings);
    conversation_window(&context.recent_messages, window_size)
} else {
    context.recent_messages.clone()
};
```

## Files Changed

### Backend (Rust)

#### `src-tauri/src/storage_manager/group_sessions.rs`
- Added `memory_tool_events: Vec<serde_json::Value>` field to `GroupSession` struct
- Updated SQL query in `read_group_session` to SELECT memory_tool_events column
- Updated `group_session_update_memories_internal` signature to accept `memory_tool_events` parameter
- Updated INSERT in `group_session_create` to initialize empty memory_tool_events array
- All changes maintain backward compatibility via `#[serde(default)]`

#### `src-tauri/src/group_chat_manager/mod.rs`
- **process_group_dynamic_memory_cycle**: Replaced modulo check with proper `last_window_end` tracking
  - Extract last_window_end from session.memory_tool_events
  - Skip if no new messages since last run
  - Skip if not enough new messages (< window_size)
  - Record memory_event with windowEnd after successful cycle
- **generate_character_response**: Apply conversation_window filter for dynamic memory mode
  - Only send last N messages to LLM when dynamic memory enabled
  - Selection context still loads 30 messages for fair character selection
- **save_group_session_memories**: Pass session.memory_tool_events to update function
- **build_selection_context**: Increased message load from 10