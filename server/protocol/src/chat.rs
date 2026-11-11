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

impl ChatSource {
    /// The source with this name, which the wire and the database's chat log both use.
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "user" => Some(Self::User),
            "server" => Some(Self::Server),
            "discord" => Some(Self::Discord),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Chat {
    /// Pre-escaped HTML, not an instruction to escape or normalize again.
    #[schemars(length(min = 1))]
    pub text: String,
    pub source: ChatSource,
    pub sent_at: Timestamp,
    /// The author. Absent when nobody wrote the message, such as a server message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<Username>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<ChatId>,
    /// The table whose chat shows the message. Absent means the lobby, or the recipient's current
    /// chat for a private message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient: Option<Username>,
    /// What the message's button applies to the table, in a suggestion to its owner.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<TableSettings>,
}

impl Chat {
    pub fn new(text: impl Into<String>, source: ChatSource, sent_at: impl Into<Timestamp>) -> Self {
        Self {
            text: text.into(),
            source,
            sent_at: sent_at.into(),
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
    pub chat_id: ChatId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatList {
    pub messages: Vec<Chat>,
    pub unread: Count,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatPmHistory {
    pub messages: Vec<Chat>,
    /// The table whose chat requested the history. Absent means the lobby.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatTyping {
    pub table_id: TableId,
    pub username: Username,
    pub typing: bool,
}
