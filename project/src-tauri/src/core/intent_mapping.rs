//! `intent_mapping` 读写：纠错写入用户规则、聚合时按优先级解析 Intent。

use rusqlite::{params, Connection, OptionalExtension};

const PRIORITY_USER_APP: i32 = 100;
const PRIORITY_USER_BUNDLE: i32 = 110;

/// 按 `priority` 降序、`id` 降序取第一条匹配规则。
pub fn resolve_intent(
    conn: &Connection,
    app_name: &str,
    bundle_id: Option<&str>,
) -> rusqlite::Result<Option<String>> {
    let bundle = bundle_id.map(str::trim).filter(|s| !s.is_empty());
    if let Some(b) = bundle {
        let row: Option<String> = conn
            .query_row(
                "SELECT intent FROM intent_mapping \
                 WHERE (match_field = 'bundle_id' AND match_pattern = ?1) \
                    OR (match_field = 'app_name' AND match_pattern = ?2) \
                 ORDER BY priority DESC, id DESC LIMIT 1",
                params![b, app_name],
                |r| r.get(0),
            )
            .optional()?;
        return Ok(row);
    }
    let row: Option<String> = conn
        .query_row(
            "SELECT intent FROM intent_mapping \
             WHERE match_field = 'app_name' AND match_pattern = ?1 \
             ORDER BY priority DESC, id DESC LIMIT 1",
            [app_name],
            |r| r.get(0),
        )
        .optional()?;
    Ok(row)
}

/// 用户纠错后写入/覆盖非内置规则（同 app / bundle 仅保留当前 intent）。
pub fn upsert_user_intent_rule(
    conn: &mut Connection,
    app_name: &str,
    bundle_id: Option<&str>,
    intent: &str,
) -> rusqlite::Result<()> {
    let intent = intent.trim();
    if intent.is_empty() {
        return Ok(());
    }
    conn.execute(
        "DELETE FROM intent_mapping WHERE is_builtin = 0 AND match_field = 'app_name' AND match_pattern = ?1",
        [app_name],
    )?;
    if let Some(b) = bundle_id.map(str::trim).filter(|s| !s.is_empty()) {
        conn.execute(
            "DELETE FROM intent_mapping WHERE is_builtin = 0 AND match_field = 'bundle_id' AND match_pattern = ?1",
            [b],
        )?;
    }
    conn.execute(
        "INSERT INTO intent_mapping (match_pattern, match_field, intent, priority, is_builtin) \
         VALUES (?1, 'app_name', ?2, ?3, 0)",
        params![app_name, intent, PRIORITY_USER_APP],
    )?;
    if let Some(b) = bundle_id.map(str::trim).filter(|s| !s.is_empty()) {
        conn.execute(
            "INSERT INTO intent_mapping (match_pattern, match_field, intent, priority, is_builtin) \
             VALUES (?1, 'bundle_id', ?2, ?3, 0)",
            params![b, intent, PRIORITY_USER_BUNDLE],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::core::storage::migrations::run_migrations;

    use super::{resolve_intent, upsert_user_intent_rule};

    fn conn_migrated() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        run_migrations(&mut c).unwrap();
        c
    }

    #[test]
    fn resolve_prefers_higher_priority() {
        let c = conn_migrated();
        c.execute(
            "INSERT INTO intent_mapping (match_pattern, match_field, intent, priority, is_builtin) \
             VALUES ('X', 'app_name', '低', 10, 1), ('X', 'app_name', '高', 200, 1)",
            [],
        )
        .unwrap();
        let r = resolve_intent(&c, "X", None).unwrap();
        assert_eq!(r.as_deref(), Some("高"));
    }

    #[test]
    fn bundle_over_app_when_user_bundle_rule() {
        let mut c = conn_migrated();
        c.execute(
            "INSERT INTO intent_mapping (match_pattern, match_field, intent, priority, is_builtin) \
             VALUES ('App', 'app_name', '来自名', 100, 0)",
            [],
        )
        .unwrap();
        upsert_user_intent_rule(&mut c, "App", Some("com.x"), "来自包").unwrap();
        let r = resolve_intent(&c, "App", Some("com.x")).unwrap();
        assert_eq!(r.as_deref(), Some("来自包"));
    }
}
