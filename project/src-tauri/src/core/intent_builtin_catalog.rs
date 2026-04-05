//! 常见应用的默认 Intent 分组（内置规则，优先级低于用户规则）。
//! 依据各平台公开 Bundle ID 与常见前台显示名整理；升级 `BUILTIN_CATALOG_VERSION` 可全量刷新内置行。

use rusqlite::{params, Connection, OptionalExtension};

use super::settings;

/// 递增后会在下次启动时删除旧 `is_builtin=1` 并重新写入词表。
pub const BUILTIN_CATALOG_VERSION: i32 = 1;

const SETTINGS_KEY: &str = "intent_builtin_catalog_version";

#[derive(Clone, Copy)]
pub struct BuiltinRule {
    pub pattern: &'static str,
    /// `app_name` 或 `bundle_id`
    pub field: &'static str,
    pub intent: &'static str,
}

const PRIORITY_BUILTIN_APP: i32 = 25;
const PRIORITY_BUILTIN_BUNDLE: i32 = 35;

pub fn builtin_rules() -> &'static [BuiltinRule] {
    BUILTIN_RULES
}

/// 若版本落后则替换全部内置映射。
pub fn ensure_builtin_catalog(conn: &mut Connection) -> rusqlite::Result<()> {
    let stored: Option<i32> = conn
        .query_row(
            "SELECT CAST(value AS INTEGER) FROM settings WHERE key = ?1",
            [SETTINGS_KEY],
            |r| r.get(0),
        )
        .optional()?;
    if stored == Some(BUILTIN_CATALOG_VERSION) {
        return Ok(());
    }
    conn.execute("DELETE FROM intent_mapping WHERE is_builtin = 1", [])?;
    for r in builtin_rules() {
        let pri = if r.field == "bundle_id" {
            PRIORITY_BUILTIN_BUNDLE
        } else {
            PRIORITY_BUILTIN_APP
        };
        conn.execute(
            "INSERT INTO intent_mapping (match_pattern, match_field, intent, priority, is_builtin) \
             VALUES (?1, ?2, ?3, ?4, 1)",
            params![r.pattern, r.field, r.intent, pri],
        )?;
    }
    settings::set_setting_str(
        conn,
        SETTINGS_KEY,
        &BUILTIN_CATALOG_VERSION.to_string(),
    )?;
    Ok(())
}

// —— 编码开发 ——
const DEV: &str = "编码开发";
// —— 研究检索 ——
const RESEARCH: &str = "研究检索";
// —— 通讯沟通 ——
const COMMS: &str = "通讯沟通";

/// 词表：`pattern` 与采集到的 `app_name` 或 `bundle_id` **精确匹配**（大小写敏感）。
const BUILTIN_RULES: &[BuiltinRule] = &[
    // —— Bundle：IDE / 终端 / 工程工具 ——
    BuiltinRule { pattern: "com.microsoft.VSCode", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.todesktop.230313mzl4w4u92", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.apple.dt.Xcode", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.google.android.studio", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.jetbrains.intellij", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.jetbrains.WebStorm", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.jetbrains.pycharm", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.jetbrains.goland", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.jetbrains.rustrover", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.jetbrains.CLion", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.jetbrains.datagrip", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.sublimetext.4", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.sublimetext.3", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "org.vim.MacVim", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "io.neovim.nvim", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.apple.Terminal", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.googlecode.iterm2", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "dev.warp.Warp-Stable", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "co.zeit.hyper", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.docker.docker", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.postmanlabs.mac", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.insomnia.app", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.tinyapp.TablePlus", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "io.dbeaver.DBeaver.product", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.github.GitHubClient", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.torusknot.SourceTree", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.DanPristupov.Fork", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.fournova.Tower3", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.figma.Desktop", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.bohemiancoding.sketch3", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.linear", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.culturedcode.ThingsMac", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.omnigroup.OmniFocus3", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.raycast.macos", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.apple.dt.Simulator", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.apple.Console", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "com.apple.ActivityMonitor", field: "bundle_id", intent: DEV },
    // Windows / 跨平台常见
    BuiltinRule { pattern: "devenv", field: "bundle_id", intent: DEV },
    BuiltinRule { pattern: "Code.exe", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "WindowsTerminal.exe", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "pwsh", field: "app_name", intent: DEV },
    // —— Bundle：浏览器 / 阅读 / 笔记 ——
    BuiltinRule { pattern: "com.apple.Safari", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.google.Chrome", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "org.chromium.Chromium", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.microsoft.edgemac", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "org.mozilla.firefox", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.brave.Browser", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "company.thebrowser.Browser", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "notion.id", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "md.obsidian", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.Notes", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "net.shinyfrog.bear", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.evernote.Evernote", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.readdle.PDFExpert-Mac", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.Preview", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.iBooksX", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.freeform", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.Maps", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.calculator", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.Dictionary", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.Translate", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.openai.chat", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "ai.perplexity.mac", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.finder", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.microsoft.Excel", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.microsoft.Word", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.microsoft.Powerpoint", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.Numbers", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.Pages", field: "bundle_id", intent: RESEARCH },
    BuiltinRule { pattern: "com.apple.Keynote", field: "bundle_id", intent: RESEARCH },
    // —— Bundle：通讯 ——
    BuiltinRule { pattern: "com.tencent.xinWeChat", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.tencent.WeWorkMac", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.tencent.qq", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.tinyspeck.slackmacgap", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.microsoft.teams2", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.microsoft.teams", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.hnc.Discord", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "us.zoom.xos", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.apple.mail", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.microsoft.Outlook", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.readdle.smartemailmanager", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.apple.MobileSMS", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "ru.keepcoder.Telegram", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "net.whatsapp.WhatsApp", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.alibaba.DingTalkMac", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.bytedance.lark", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.apple.FaceTime", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.apple.Calendar", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.apple.reminders", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.twitter.twitter-mac", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.atebits.Tweetie2", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.linkedin.LinkedIn", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.facebook.archon.developerID", field: "bundle_id", intent: COMMS },
    BuiltinRule { pattern: "com.tdesktop.Telegram", field: "bundle_id", intent: COMMS },
    // —— 常见中文/英文应用显示名（无 Bundle 或跨平台） ——
    BuiltinRule { pattern: "Visual Studio Code", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Cursor", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Xcode", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Android Studio", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "IntelliJ IDEA", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "WebStorm", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "PyCharm", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "GoLand", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "RustRover", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Terminal", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "iTerm2", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Warp", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Docker Desktop", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Postman", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Figma", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "GitHub Desktop", field: "app_name", intent: DEV },
    BuiltinRule { pattern: "Safari浏览器", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Safari", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Google Chrome", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Chromium", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Microsoft Edge", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Firefox", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Brave Browser", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Arc", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Notion", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "Obsidian", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "备忘录", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "预览", field: "app_name", intent: RESEARCH },
    BuiltinRule { pattern: "微信", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "WeChat", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "企业微信", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "QQ", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "Slack", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "Microsoft Teams", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "Discord", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "Zoom", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "邮件", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "Mail", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "信息", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "Messages", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "Telegram", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "钉钉", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "飞书", field: "app_name", intent: COMMS },
    BuiltinRule { pattern: "Lark", field: "app_name", intent: COMMS },
];
