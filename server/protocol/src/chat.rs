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
    pub msg: String,
    pub source: ChatSource,
    #[schemars(with = "Timestamp")]
    pub datetime: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub who: Option<String>,
    #[serde(default, rename = "chatID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub room: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub recipient: Option<String>,
    /// Options that the message's button applies to the table, in a suggestion to its owner.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "GameOptions")]
    pub suggested_options: Option<GameOptions>,
}

impl Chat {
    pub fn new(msg: impl Into<String>, source: ChatSource, datetime: impl Into<String>) -> Self {
        Self {
            msg: msg.into(),
            source,
            datetime: datetime.into(),
            who: None,
            chat_id: None,
            room: None,
            recipient: None,
            suggested_options: None,
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
    pub room: LobbyRoom,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum LobbyRoom {
    Lobby,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatList {
    #[schemars(extend("x-readonly" = true))]
    pub list: Vec<Chat>,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub unread: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistoryMessage {
    #[schemars(length(min = 1))]
    pub msg: String,
    #[schemars(length(min = 1))]
    pub who: String,
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
    pub list: Vec<ChatHistoryMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub room: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatTyping {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub name: String,
    pub typing: bool,
}
