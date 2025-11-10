use rusqlite::{params, Connection, OptionalExtension, Row};

pub fn query_one<T, F>(conn: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql], map: F) -> Result<Option<T>, String>
where
    F: FnOnce(&Row<'_>) -> Result<T, rusqlite::Error>,
{
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let res = stmt.query_row(p, map).optional().map_err(|e| e.to_string())?;
    Ok(res)
}

pub fn query_all<T, F>(conn: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql], map: F) -> Result<Vec<T>, String>
where
    F: FnMut(&Row<'_>) -> Result<T, rusqlite::Error>,
{
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(p, map)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub fn exec(conn: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql]) -> Result<usize, String> {
    conn.execute(sql, p).map_err(|e| e.to_string())
}

pub fn now_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
