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

/// A chat message.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Chat {
    /// Pre-escaped HTML, not an instruction to escape or normalize again.
    #[schemars(length(min = 1))]
    pub text: String,
    pub sent_at: Timestamp,
    /// Absent for a message that the chat log does not keep, or does not keep yet.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<ChatId>,
    /// The table whose chat shows the message. Absent means the lobby, or the recipient's current
    /// chat for a private message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
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
    /// A message from the server to a table's owner, with a button that applies these settings to
    /// the table.
    Suggestion {
        recipient: Username,
        settings: TableSettings,
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

impl Chat {
    pub fn new(text: impl Into<String>, kind: ChatKind, sent_at: impl Into<Timestamp>) -> Self {
        Self {
            text: text.into(),
            sent_at: sent_at.into(),
            chat_id: None,
            table_id: None,
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
            ChatKind::Suggestion { .. } => &ChatAuthor::Server {},
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatDeleted {
    pub chat_id: ChatId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatList {
    pub messages: Vec<Chat>,
    pub num_unread: Count,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatPmHistory {
    pub messages: Vec<Chat>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatTyping {
    pub table_id: TableId,
    pub username: Username,
    pub typing: bool,
}
