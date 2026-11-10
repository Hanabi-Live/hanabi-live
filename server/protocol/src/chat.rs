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
#[schemars(extend("x-readonly" = true))]
pub struct Chat {
    /// Pre-escaped HTML, not an instruction to escape or normalize again.
    #[schemars(length(min = 1))]
    pub text: String,
    pub source: ChatSource,
    #[schemars(with = "Timestamp")]
    pub datetime: String,
    /// The author. Absent when nobody wrote the message, such as a server message.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub username: Option<String>,
    #[serde(default, rename = "chatID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: Option<i64>,
    /// The table whose chat shows the message. Absent means the lobby, or the recipient's current
    /// chat for a private message.
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub recipient: Option<String>,
    /// What the message's button applies to the table, in a suggestion to its owner.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableSuggestion")]
    pub suggestion: Option<TableSuggestion>,
}

/// A table's name, player limit, and options, as a suggestion to its owner proposes them.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct TableSuggestion {
    #[schemars(length(min = 1))]
    pub name: String,
    #[schemars(with = "NumPlayers")]
    pub max_players: u8,
    pub options: GameOptions,
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
#[schemars(extend("x-readonly" = true))]
pub struct ChatDelete {
    #[serde(rename = "chatID")]
    #[schemars(range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatList {
    #[schemars(extend("x-readonly" = true))]
    pub messages: Vec<Chat>,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub unread: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistoryMessage {
    #[schemars(length(min = 1))]
    pub text: String,
    #[schemars(length(min = 1))]
    pub username: String,
    #[schemars(length(min = 1))]
    pub recipient: String,
    #[schemars(with = "Timestamp")]
    pub datetime: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistory {
    #[schemars(extend("x-readonly" = true))]
    pub messages: Vec<ChatHistoryMessage>,
    /// The table whose chat requested the history. Absent means the lobby.
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatTyping {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub username: String,
    pub typing: bool,
}
