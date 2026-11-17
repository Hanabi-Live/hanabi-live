//! Times in UTC, and their RFC 3339 text.

use time::format_description::FormatItem;
use time::format_description::well_known::Rfc3339;
use time::macros::format_description;
use time::{OffsetDateTime, UtcOffset};

/// The form of a time that people read, such as "Tue Nov 17 05:33:33 UTC 2026".
const IN_WORDS: &[FormatItem<'_>] = format_description!(
    "[weekday repr:short] [month repr:short] [day] [hour]:[minute]:[second] UTC [year]"
);

/// Returns `time` as RFC 3339 text in UTC, such as "2026-01-01T12:00:00.123456789Z".
pub fn rfc3339(time: OffsetDateTime) -> String {
    time.to_offset(UtcOffset::UTC)
        .format(&Rfc3339)
        .expect("A UTC time with a four-digit year formats as RFC 3339")
}

/// Reads RFC 3339 text, such as "2026-01-01T12:00:00Z", as a time in UTC.
pub fn parse_rfc3339(text: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(text, &Rfc3339)
        .ok()
        .map(|time| time.to_offset(UtcOffset::UTC))
}

/// Returns `time` in UTC as people read it, such as "Tue Nov 17 05:33:33 UTC 2026".
pub fn in_words(time: OffsetDateTime) -> String {
    time.to_offset(UtcOffset::UTC)
        .format(IN_WORDS)
        .expect("A UTC time with a four-digit year formats in words")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_forms_that_checkpoints_and_the_database_hold() {
        let time = OffsetDateTime::from_unix_timestamp_nanos(1_767_268_800_123_456_000).unwrap();
        // The form that chrono wrote in checkpoints before the server used time.
        assert_eq!(parse_rfc3339("2026-01-01T12:00:00.123456Z"), Some(time));
        // The form of PostgreSQL's "to_jsonb".
        assert_eq!(
            parse_rfc3339("2026-01-01T12:00:00.123456+00:00"),
            Some(time)
        );
        assert_eq!(rfc3339(time), "2026-01-01T12:00:00.123456Z");
        assert_eq!(in_words(time), "Thu Jan 01 12:00:00 UTC 2026");
    }
}
