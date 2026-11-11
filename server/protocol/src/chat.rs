//! Chat messages and their history.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ChatSource {
    User,
    Server,
    Discord,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Chat {
    /// Pre-escaped HTML, not an instruction to escape or normalize again.
    #[schemars(length(min = 1))]
    pub text: String,
    pub source: ChatSource,
    #[schemars(with = "Timestamp")]
    pub datetime: String,
    /// The author. Absent when nobody wrote the message, such as a server message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(rename = "chatID", skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: Option<i64>,
    /// The table whose chat shows the message. Absent means the lobby, or the recipient's current
    /// chat for a private message.
    #[serde(rename = "tableID", skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient: Option<String>,
    /// What the message's button applies to the table, in a suggestion to its owner.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<TableSettings>,
}

impl Chat {
    pub fn new(text: impl Into<String>, source: ChatSource, datetime: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            source,
            datetime: datetime.into(),
            username: None,
            chat_id: None,
            table_id: None,
            recipient: None,
            suggestion: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatDelete {
    #[serde(rename = "chatID")]
    #[schemars(range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatList {
    pub messages: Vec<Chat>,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub unread: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatPmHistory {
    pub messages: Vec<Chat>,
    /// The table whose chat requested the history. Absent means the lobby.
    #[serde(rename = "tableID", skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatTyping {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(with = "Username")]
    pub username: String,
    pub typing: bool,
}
