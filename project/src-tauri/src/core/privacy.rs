use regex::Regex;
use std::sync::LazyLock;

static BLACKLIST_BUNDLE: &[&str] = &[
    "com.apple.keychainaccess",
    "com.1password",
];

static BLACKLIST_TITLE_SUBSTR: &[&str] = &["密码", "Password", "login", "Login"];

static URL_IN_TITLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(https?://[^\s]+)").expect("regex")
});

pub fn should_redact_bundle(bundle_id: &str) -> bool {
    BLACKLIST_BUNDLE
        .iter()
        .any(|b| bundle_id.eq_ignore_ascii_case(b))
}

pub fn redact_title(title: &str) -> String {
    if BLACKLIST_TITLE_SUBSTR
        .iter()
        .any(|s| title.contains(s))
    {
        return "[redacted]".to_string();
    }
    let mut t = title.to_string();
    if let Some(caps) = URL_IN_TITLE.captures(&t) {
        if let Some(m) = caps.get(1) {
            let url = m.as_str();
            let trimmed = trim_url_params(url);
            t = t.replace(url, &trimmed);
        }
    }
    t
}

fn trim_url_params(url: &str) -> String {
    if let Some(i) = url.find('?') {
        format!("{}…", &url[..i])
    } else {
        url.to_string()
    }
}

/// Best-effort URL / path hints from window title (no extra OS calls).
pub fn extract_url_and_path(title: &str) -> (Option<String>, Option<String>) {
    let url = URL_IN_TITLE
        .captures(title)
        .and_then(|c| c.get(1).map(|m| trim_url_params(m.as_str())));
    let path_hint = if title.contains('/') && (title.contains(".rs") || title.contains(".ts")) {
        static FILEISH: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(r"([\w./~-]+\.(?:rs|ts|tsx|js|json|md|py))\b").expect("regex")
        });
        FILEISH
            .captures(title)
            .and_then(|c| c.get(1).map(|m| redact_path(m.as_str())))
    } else {
        None
    };
    (url, path_hint)
}

pub fn redact_path(path: &str) -> String {
    if path.is_empty() {
        return path.to_string();
    }
    if let Some(home) = dirs::home_dir() {
        let hs = home.to_string_lossy();
        if path.starts_with(hs.as_ref()) {
            return path.replacen(hs.as_ref(), "~", 1);
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_title_password_substring() {
        assert_eq!(redact_title("my login page"), "[redacted]");
        assert_eq!(redact_title("normal title"), "normal title");
    }

    #[test]
    fn redact_title_trims_url_query_in_place() {
        let t = redact_title("tab — https://example.com/path?q=secret&x=1");
        assert!(
            !t.contains("q=secret"),
            "query should be stripped or shortened: {t}"
        );
    }

    #[test]
    fn should_redact_keychain_bundle() {
        assert!(should_redact_bundle("com.apple.keychainaccess"));
        assert!(!should_redact_bundle("com.timelens.app"));
    }
}
