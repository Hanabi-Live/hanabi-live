use unicode_normalization::UnicodeNormalization;

/// Transliterates to lower-case ASCII, dropping characters that have no transliteration.
pub fn normalize_string(input: &str) -> String {
    deunicode::deunicode_with_tofu(input, "").to_lowercase()
}

#[cfg(test)]
pub fn normalize_username(input: &str) -> String {
    normalize_string(input.trim())
}

/// Matches pictographs, regional indicators (flags), and keycaps.
pub fn has_username_emoji(input: &str) -> bool {
    regex!(r"[\p{Extended_Pictographic}\p{Regional_Indicator}\x{20E3}]").is_match(input)
}

/// The most combining marks, such as diacritics, that text may stack on one character.
pub const MAX_CONSECUTIVE_MARKS: usize = 3;

pub fn max_consecutive_marks(input: &str) -> usize {
    let mut count = 0;
    let mut maximum = 0;
    for ch in input.nfd() {
        let mut bytes = [0; char::MAX_LEN_UTF8];
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

    #[test]
    fn lookalike_usernames_share_a_normalization() {
        assert_eq!(normalize_username(" \u{c5}lice "), "alice");
        assert_eq!(normalize_string("\u{391}lice"), "alice");
        assert_eq!(normalize_string("\u{10ffff}"), "");
        for emoji in ["🦄", "🇺🇸", "#\u{20e3}", "©"] {
            assert!(has_username_emoji(emoji), "{emoji}");
        }
        assert!(!has_username_emoji("Alice_1.-é"));
    }
}
