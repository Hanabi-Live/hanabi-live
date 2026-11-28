use hanabi_protocol::MAX_CHAT_LENGTH;
use unicode_normalization::UnicodeNormalization;

/// Removes every character that is not text. All text from a client goes through this before the
/// server stores it or matches it, so that no control character (such as NUL, which PostgreSQL
/// refuses) or invisible character gets in. Every kind of space becomes a plain space, so that it
/// still separates words. Other characters that are not letters, marks, numbers, punctuation, or
/// symbols are removed.
pub fn remove_non_text(input: &str) -> String {
    let spaced = regex!(r"\s").replace_all(input, " ");
    regex!(r"[^\p{L}\p{M}\p{N}\p{P}\p{S} ]")
        .replace_all(&spaced, "")
        .into_owned()
}

/// Transliterates to lower-case ASCII, dropping characters that have no transliteration and
/// characters that are not text.
pub fn normalize_string(input: &str) -> String {
    remove_non_text(&deunicode::deunicode_with_tofu(input, "")).to_lowercase()
}

/// The key that a new username must not share with an existing account's normalized username. It
/// replaces each character that looks like another with that character (the "skeleton" of Unicode
/// Technical Standard #39), then normalizes the result. For example, `AIice` (with a capital i)
/// and `Alice` with a Cyrillic A both have the key `alice`.
pub fn lookalike_key(username: &str) -> String {
    normalize_string(&unicode_security::skeleton(username.trim()).collect::<String>())
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

/// Cleans text that a player writes, such as a chat message or a note: removes the characters that
/// are not text, then the spaces at the start and the end.
pub fn clean_text(input: &str) -> String {
    remove_non_text(input).trim().to_owned()
}

/// Returns the first `max` characters of `input`.
pub fn truncate_to_max_chars(input: &str, max: usize) -> &str {
    input
        .char_indices()
        .nth(max)
        .map_or(input, |(end, _)| &input[..end])
}

/// Cleans a chat message from a player. Rejects it if it is longer than `MAX_CHAT_LENGTH`, so that
/// it never arrives changed without the player knowing.
pub fn normalize_chat(input: &str) -> Result<String, String> {
    let message = clean_chat(input)?;
    if message.chars().count() > MAX_CHAT_LENGTH {
        return Err(format!(
            "Chat messages cannot be longer than {MAX_CHAT_LENGTH} characters."
        ));
    }
    Ok(message)
}

/// Cleans a chat message from Discord. Discord allows longer messages and does not show our limit,
/// so this truncates the message to `MAX_CHAT_LENGTH` instead of rejecting it.
pub fn normalize_discord_chat(input: &str) -> Result<String, String> {
    clean_chat(truncate_to_max_chars(input, MAX_CHAT_LENGTH))
}

fn clean_chat(input: &str) -> Result<String, String> {
    let message = clean_text(input);
    if message.is_empty() {
        return Err("Chat messages cannot be blank.".into());
    }
    if max_consecutive_marks(&message) > MAX_CONSECUTIVE_MARKS {
        return Err(format!(
            "Chat messages cannot contain more than {MAX_CONSECUTIVE_MARKS} consecutive diacritics."
        ));
    }
    Ok(message)
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
    if name.chars().any(char::is_control) {
        return Err("Usernames cannot contain any control characters.".into());
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

/// Matches characters that draw nothing or change how nearby text draws: control, format, and
/// space characters, characters that fonts ignore, and blank glyphs such as the braille blank.
fn has_invisible_characters(input: &str) -> bool {
    regex!(r"[\p{Cc}\p{Cf}\p{Z}\p{Default_Ignorable_Code_Point}\x{2800}]").is_match(input)
}

/// Validates the name of a new account. It is stricter than `validate_username`, which still lets
/// older accounts with such names sign in.
pub fn validate_new_username(input: &str) -> Result<&str, String> {
    let name = validate_username(input)?;
    if has_invisible_characters(name) {
        return Err("Usernames cannot contain invisible or blank characters.".into());
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookalike_usernames_share_a_key() {
        for lookalike in [
            "Alice",
            "AIice",
            "A1ice",
            "\u{410}lice",
            "\u{13AA}lice",
            " alice ",
        ] {
            assert_eq!(lookalike_key(lookalike), "alice", "{lookalike}");
        }
        for (lookalike, key) in [("\u{421}at", "cat"), ("\u{440}aul", "paul"), ("B0b", "bob")] {
            assert_eq!(lookalike_key(lookalike), key, "{lookalike}");
        }
    }
    #[test]
    fn byte_limits_and_decomposed_marks() {
        assert!(validate_username("123456789012345").is_ok());
        assert!(validate_username("12345678901234é").is_err());
        assert_eq!(max_consecutive_marks("é\u{301}\u{301}\u{301}"), 4);
        assert!(validate_username("é\u{301}\u{301}\u{301}").is_err());
        assert_eq!(
            normalize_chat(" \tHello\nWorld\r "),
            Ok("Hello World".into())
        );
        // A non-breaking or full-width space still separates words, such as a command from its
        // first word.
        assert_eq!(
            normalize_chat("/pm\u{a0}Bob\u{3000}hi"),
            Ok("/pm Bob hi".into())
        );
        assert_eq!(clean_text(" r1\u{a0}b2\u{200B} "), "r1 b2");
        assert_eq!(truncate_to_max_chars("éé", 1), "é");
        assert_eq!(truncate_to_max_chars("éé", 3), "éé");
    }

    #[test]
    fn long_chat_is_rejected_from_players_and_truncated_from_discord() {
        let longest = "é".repeat(MAX_CHAT_LENGTH);
        assert_eq!(normalize_chat(&longest), Ok(longest.clone()));
        let too_long = format!("{longest}é");
        assert!(normalize_chat(&too_long).is_err());
        assert_eq!(normalize_discord_chat(&too_long), Ok(longest));
    }

    #[test]
    fn lookalike_usernames_share_a_normalization() {
        assert_eq!(normalize_username(" \u{c5}lice "), "alice");
        assert_eq!(normalize_string("\u{391}lice"), "alice");
        assert_eq!(normalize_string("\u{10ffff}"), "");
        // PostgreSQL refuses a NUL character in text.
        assert_eq!(normalize_string("A\u{0}b\u{1b}c\u{7f}"), "abc");
        assert_eq!(remove_non_text(" a\u{0}\tb\u{202E} "), " a b ");
        assert!(validate_username("Al\u{0}ice").is_err());
        for emoji in ["🦄", "🇺🇸", "#\u{20e3}", "©"] {
            assert!(has_username_emoji(emoji), "{emoji}");
        }
        assert!(!has_username_emoji("Alice_1.-é"));
    }

    #[test]
    fn new_usernames_cannot_contain_invisible_characters() {
        for name in [
            "Alice\u{200B}",
            "Al\u{180E}ice",
            "\u{202E}Alice",
            "\u{2800}\u{2800}",
            "Al\u{AD}ice",
            "Al\u{3164}ice",
            "Al\u{8}ice",
            "Al\u{2028}ice",
        ] {
            assert!(validate_new_username(name).is_err(), "{name:?}");
        }
        assert_eq!(validate_new_username(" Alice_1.-é "), Ok("Alice_1.-é"));
        // Older accounts with such names can still sign in.
        assert!(validate_username("\u{202E}Alice").is_ok());
    }
}
