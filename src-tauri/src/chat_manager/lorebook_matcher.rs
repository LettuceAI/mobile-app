use crate::storage_manager::db::DbConnection;
use crate::storage_manager::lorebook::{get_enabled_character_lorebook_entries, LorebookEntry};

pub fn get_active_lorebook_entries(
    conn: &DbConnection,
    character_id: &str,
    recent_messages: &[String], 
) -> Result<Vec<LorebookEntry>, String> {
    let entries = get_enabled_character_lorebook_entries(conn, character_id)?;

    if entries.is_empty() {
        return Ok(vec![]);
    }

    let context = recent_messages.join("\n").to_lowercase();

    let mut active_entries: Vec<LorebookEntry> = vec![];

    for entry in entries {
        let should_activate = if entry.always_active {
            true
        } else if entry.keywords.is_empty() {
            false
        } else {
            entry.keywords.iter().any(|keyword| {
                if keyword.trim().is_empty() {
                    return false;
                }

                if entry.case_sensitive {
                    let original_context = recent_messages.join("\n");
                    original_context.contains(keyword)
                } else {
                    let keyword_lower = keyword.to_lowercase();
                    context.contains(&keyword_lower)
                }
            })
        };

        if should_activate {
            active_entries.push(entry);
        }
    }

    // Sort by display_order (lower = higher priority in list)
    active_entries.sort_by(|a, b| {
        a.display_order
            .cmp(&b.display_order)
            .then_with(|| a.created_at.cmp(&b.created_at))
    });

    Ok(active_entries)
}

/// Format lorebook entries into a string for prompt injection
/// Each entry is separated by a double newline
pub fn format_lorebook_for_prompt(entries: &[LorebookEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    entries
        .iter()
        .map(|entry| entry.content.trim())
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_lorebook_for_prompt() {
        let entries = vec![
            LorebookEntry {
                id: "1".to_string(),
                lorebook_id: "lorebook1".to_string(),
                title: "Entry 1".to_string(),
                enabled: true,
                always_active: false,
                keywords: vec![],
                case_sensitive: false,
                content: "Entry 1 content".to_string(),
                priority: 0,
                display_order: 0,
                created_at: 0,
                updated_at: 0,
            },
            LorebookEntry {
                id: "2".to_string(),
                lorebook_id: "lorebook1".to_string(),
                title: "Entry 2".to_string(),
                enabled: true,
                always_active: false,
                keywords: vec![],
                case_sensitive: false,
                content: "Entry 2 content".to_string(),
                priority: 0,
                display_order: 1,
                created_at: 0,
                updated_at: 0,
            },
        ];

        let result = format_lorebook_for_prompt(&entries);
        assert_eq!(result, "Entry 1 content\n\nEntry 2 content");
    }

    #[test]
    fn test_format_lorebook_empty() {
        let entries = vec![];
        let result = format_lorebook_for_prompt(&entries);
        assert_eq!(result, "");
    }
}
