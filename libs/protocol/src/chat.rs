//! Chat messages and their history.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

named_enum! {
    /// Who wrote a chat message, by the names that the database's chat log uses, which are also the
    /// types of `ChatAuthor`.
    pub enum ChatSource {
        User => "user",
        Server => "server",
        Discord => "discord",
    }
}

/// A chat message, and the table whose chat shows it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Chat {
    /// The table whose chat shows the message. Absent for a message that belongs to no table: a
    /// message in the lobby, or a private message, which shows in the chat that the recipient has
    /// open.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
    #[serde(flatten)]
    pub message: ChatMessage,
}

impl From<ChatMessage> for Chat {
    /// A message that belongs to no table.
    fn from(message: ChatMessage) -> Self {
        Self {
            table_id: None,
            message,
        }
    }
}

/// A chat message, without the chat that shows it. A list of messages names their chat once.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatMessage {
    /// Plain text, which the client escapes. A newline starts a new line.
    #[schemars(length(min = 1))]
    pub text: String,
    pub sent_at: Timestamp,
    /// Absent for a message that the chat log does not keep, or does not keep yet.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<ChatId>,
    pub kind: ChatKind,
}

/// Who a chat message is for, and who wrote it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ChatKind {
    /// A message to everyone in the lobby or at the table.
    Public { author: ChatAuthor },
    /// A message to one user.
    Private {
        author: ChatAuthor,
        recipient: Username,
    },
}

/// Who wrote a chat message.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ChatAuthor {
    User {
        username: Username,
    },
    /// The Discord server, whose messages the lobby mirrors.
    Discord {
        /// The Discord user who wrote the message. Absent for a notice about the Discord server.
        #[serde(skip_serializing_if = "Option::is_none")]
        username: Option<Username>,
    },
    Server {},
}

impl ChatAuthor {
    /// The author that the chat log records with this source and name. A user has a name, and the
    /// server has none.
    pub fn new(source: ChatSource, username: Option<Username>) -> Option<Self> {
        match (source, username) {
            (ChatSource::User, Some(username)) => Some(Self::User { username }),
            (ChatSource::Discord, username) => Some(Self::Discord { username }),
            (ChatSource::Server, None) => Some(Self::Server {}),
            _ => None,
        }
    }

    pub const fn source(&self) -> ChatSource {
        match self {
            Self::User { .. } => ChatSource::User,
            Self::Discord { .. } => ChatSource::Discord,
            Self::Server {} => ChatSource::Server,
        }
    }
}

impl ChatMessage {
    pub fn new(text: impl Into<String>, kind: ChatKind, sent_at: impl Into<Timestamp>) -> Self {
        Self {
            text: text.into(),
            sent_at: sent_at.into(),
            chat_id: None,
            kind,
        }
    }

    /// A message to everyone in the lobby or at the table.
    pub fn public(
        text: impl Into<String>,
        author: ChatAuthor,
        sent_at: impl Into<Timestamp>,
    ) -> Self {
        Self::new(text, ChatKind::Public { author }, sent_at)
    }

    /// A message from the server to everyone in the lobby or at the table.
    pub fn server(text: impl Into<String>, sent_at: impl Into<Timestamp>) -> Self {
        Self::public(text, ChatAuthor::Server {}, sent_at)
    }

    /// A message to one user.
    pub fn private(
        text: impl Into<String>,
        author: ChatAuthor,
        recipient: impl Into<Username>,
        sent_at: impl Into<Timestamp>,
    ) -> Self {
        Self::new(
            text,
            ChatKind::Private {
                author,
                recipient: recipient.into(),
            },
            sent_at,
        )
    }

    /// Who wrote the message.
    pub const fn author(&self) -> &ChatAuthor {
        match &self.kind {
            ChatKind::Public { author } | ChatKind::Private { author, .. } => author,
        }
    }
}

/// Settings for a table that the server suggests to its owner, such as a variant from
/// `/findvariant` or the options that another player proposes. The client shows them in the
/// table's chat with a button that applies them.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSettingsSuggestion {
    pub table_id: TableId,
    pub settings: TableSettings,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatDeleted {
    pub chat_id: ChatId,
}

/// The past messages of the lobby's chat or of a table's chat, which a client receives when it
/// connects or joins the table.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatList {
    pub messages: Vec<ChatMessage>,
    /// The table whose chat this is. Absent for the lobby's chat.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table: Option<ChatListTable>,
}

/// The table of a table's `chatList`, and what the recipient has read there. The server does not
/// track what a user has read in the lobby.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatListTable {
    pub table_id: TableId,
    /// How many of the messages the recipient has not read.
    pub num_unread: Count,
}

impl ChatList {
    /// The lobby's past messages.
    pub const fn lobby(messages: Vec<ChatMessage>) -> Self {
        Self {
            messages,
            table: None,
        }
    }

    /// A table's past messages, and how many of them the recipient has not read.
    pub const fn table(table_id: TableId, messages: Vec<ChatMessage>, num_unread: Count) -> Self {
        Self {
            messages,
            table: Some(ChatListTable {
                table_id,
                num_unread,
            }),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatPmHistory {
    pub messages: Vec<ChatMessage>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatTyping {
    pub table_id: TableId,
    pub username: Username,
    pub typing: bool,
}
