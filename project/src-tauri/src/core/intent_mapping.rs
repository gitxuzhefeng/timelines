//! `intent_mapping` 读写：纠错写入用户规则、聚合时按优先级解析 Intent。

use rusqlite::{params, Connection, OptionalExtension};

const PRIORITY_USER_APP: i32 = 100;
const PRIORITY_USER_BUNDLE: i32 = 110;

/// 当前生效规则来源（用于 UI）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IntentRuleSource {
    None,
    Builtin,
    User,
}

impl IntentRuleSource {
    pub fn as_api_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Builtin => "builtin",
            Self::User => "user",
        }
    }
}

/// 按 `priority` 降序、`id` 降序取第一条匹配规则，并区分内置 / 用户。
pub fn resolve_intent_detail(
    conn: &Connection,
    app_name: &str,
    bundle_id: Option<&str>,
) -> rusqlite::Result<(Option<String>, IntentRuleSource)> {
    let bundle = bundle_id.map(str::trim).filter(|s| !s.is_empty());
    let row: Option<(String, i32)> = if let Some(b) = bundle {
        conn.query_row(
            "SELECT intent, is_builtin FROM intent_mapping \
             WHERE (match_field = 'bundle_id' AND match_pattern = ?1) \
                OR (match_field = 'app_name' AND match_pattern = ?2) \
             ORDER BY priority DESC, id DESC LIMIT 1",
            params![b, app_name],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
    } else {
        conn.query_row(
            "SELECT intent, is_builtin FROM intent_mapping \
             WHERE match_field = 'app_name' AND match_pattern = ?1 \
             ORDER BY priority DESC, id DESC LIMIT 1",
            [app_name],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
    };
    Ok(match row {
        None => (None, IntentRuleSource::None),
        Some((intent, is_builtin)) => {
            let src = if is_builtin != 0 {
                IntentRuleSource::Builtin
            } else {
                IntentRuleSource::User
            };
            (Some(intent), src)
        }
    })
}

/// 按 `priority` 降序、`id` 降序取第一条匹配规则。
pub fn resolve_intent(
    conn: &Connection,
    app_name: &str,
    bundle_id: Option<&str>,
) -> rusqlite::Result<Option<String>> {
    Ok(resolve_intent_detail(conn, app_name, bundle_id)?.0)
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

/// 删除用户为该应用键写入的规则（与 `upsert_user_intent_rule` 开头的 DELETE 语义一致，不插入新行）。
pub fn remove_user_intent_rules(
    conn: &mut Connection,
    app_name: &str,
    bundle_id: Option<&str>,
) -> rusqlite::Result<()> {
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
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::core::storage::migrations::run_migrations;

    use super::{remove_user_intent_rules, resolve_intent, upsert_user_intent_rule};

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

    #[test]
    fn remove_user_rules_clears_resolution() {
        let mut c = conn_migrated();
        upsert_user_intent_rule(&mut c, "Note", Some("com.note"), "写笔记").unwrap();
        assert_eq!(
            resolve_intent(&c, "Note", Some("com.note")).unwrap().as_deref(),
            Some("写笔记")
        );
        remove_user_intent_rules(&mut c, "Note", Some("com.note")).unwrap();
        assert_eq!(resolve_intent(&c, "Note", Some("com.note")).unwrap(), None);
    }
}
