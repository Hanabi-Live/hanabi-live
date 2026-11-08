use serde::Deserialize;
use std::{collections::HashMap, sync::LazyLock};
use unicode_normalization::UnicodeNormalization;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityData {
    pages: HashMap<String, Vec<String>>,
    username_emoji_pattern: String,
}

// Use the pinned Go unidecode tables, not a superficially similar transliterator.
// The accompanying license is packages/data/src/json/goUnidecode.LICENSE.
static IDENTITY: LazyLock<IdentityData> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../packages/data/src/json/goIdentity.json"
    ))
    .expect("checked-in Go identity data")
});

/// Code points below this, ASCII without DEL, are kept as they are.
const PASSTHROUGH_LIMIT: u32 = 0x7f;
/// The highest code point that the identity tables transliterate.
const MAX_TRANSLITERATED: u32 = 0xe_ffff;
/// The code points in each page of the identity tables.
const IDENTITY_PAGE_SIZE: u32 = 256;

pub fn normalize_string(input: &str) -> String {
    let mut result = String::new();
    for ch in input.chars() {
        let cp = ch as u32;
        if cp < PASSTHROUGH_LIMIT {
            result.push(ch);
        } else if cp <= MAX_TRANSLITERATED
            && let Some(page) = IDENTITY.pages.get(&(cp / IDENTITY_PAGE_SIZE).to_string())
            && let Some(text) = page.get((cp % IDENTITY_PAGE_SIZE) as usize)
        {
            result.push_str(text);
        }
    }
    result.to_lowercase()
}

pub fn normalize_username(input: &str) -> String {
    normalize_string(input.trim())
}

pub fn has_username_emoji(input: &str) -> bool {
    regex!(&IDENTITY.username_emoji_pattern).is_match(input)
}

/// The most combining marks, such as diacritics, that text may stack on one character.
pub const MAX_CONSECUTIVE_MARKS: usize = 3;

pub fn max_consecutive_marks(input: &str) -> usize {
    let mut count = 0;
    let mut maximum = 0;
    for ch in input.nfd() {
        let mut bytes = [0; 4];
        count = if regex!(r"^\p{Mn}$").is_match(ch.encode_utf8(&mut bytes)) {
            count + 1
        } else {
            0
        };
        maximum = maximum.max(count);
    }
    maximum
}

pub fn truncate_to_max_bytes(input: &str, max: usize) -> &str {
    let mut end = input.len().min(max);
    while !input.is_char_boundary(end) {
        end -= 1;
    }
    &input[..end]
}

/// Removes characters that chat messages and notes do not allow.
pub fn remove_disallowed_characters(input: &str) -> std::borrow::Cow<'_, str> {
    regex!(r"[^\p{L}\p{M}\p{N}\p{P}\p{S} ]").replace_all(input, "")
}

/// The longest chat message, in bytes; longer messages are truncated.
const MAX_CHAT_LENGTH: usize = 300;

pub fn normalize_chat(input: &str) -> Result<String, String> {
    let truncated = truncate_to_max_bytes(input, MAX_CHAT_LENGTH);
    let cleaned = remove_disallowed_characters(truncated);
    let message = cleaned.trim();
    if message.is_empty() {
        return Err("Chat messages cannot be blank.".into());
    }
    if max_consecutive_marks(message) > MAX_CONSECUTIVE_MARKS {
        return Err(format!(
            "Chat messages cannot contain more than {MAX_CONSECUTIVE_MARKS} consecutive diacritics."
        ));
    }
    Ok(message.to_owned())
}

pub fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&#34;")
        .replace('\'', "&#39;")
}

/// The shortest username, in bytes.
pub const MIN_USERNAME_LENGTH: usize = 2;
/// The longest username, in bytes.
pub const MAX_USERNAME_LENGTH: usize = 15;
/// Characters that usernames cannot contain.
pub const USERNAME_SPECIAL_CHARACTERS: &str = "`~!@#$%^&*()=+[{]}\\|;:'\",<>/?";

pub fn validate_username(input: &str) -> Result<&str, String> {
    let name = input.trim();
    if name.chars().any(char::is_whitespace) {
        return Err("Usernames cannot contain any whitespace characters.".into());
    }
    if name.len() < MIN_USERNAME_LENGTH {
        return Err(format!(
            "Usernames must be {MIN_USERNAME_LENGTH} characters or more."
        ));
    }
    if name.len() > MAX_USERNAME_LENGTH {
        return Err(format!(
            "Usernames must be {MAX_USERNAME_LENGTH} characters or less."
        ));
    }
    if name.contains(|ch| USERNAME_SPECIAL_CHARACTERS.contains(ch)) {
        return Err("Usernames cannot contain any special characters other than underscores, hyphens, and periods.".into());
    }
    if has_username_emoji(name) {
        return Err("Usernames cannot contain any emojis.".into());
    }
    if max_consecutive_marks(name) > MAX_CONSECUTIVE_MARKS {
        return Err(format!(
            "Usernames cannot contain more than {MAX_CONSECUTIVE_MARKS} consecutive diacritics."
        ));
    }
    if matches!(
        normalize_string(name).as_str(),
        "hanab live"
            | "hanab"
            | "hanabi"
            | "live"
            | "hlive"
            | "hanablive"
            | "hanabilive"
            | "nabilive"
    ) {
        return Err("That username is reserved. Please choose a different one.".into());
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn byte_limits_and_decomposed_marks() {
        assert!(validate_username("123456789012345").is_ok());
        assert!(validate_username("12345678901234é").is_err());
        assert_eq!(max_consecutive_marks("é\u{301}\u{301}\u{301}"), 4);
        assert!(validate_username("é\u{301}\u{301}\u{301}").is_err());
        assert_eq!(
            normalize_chat(" \tHello\nWorld\r "),
            Ok("HelloWorld".into())
        );
        assert_eq!(truncate_to_max_bytes("éé", 3), "é");
    }
}
