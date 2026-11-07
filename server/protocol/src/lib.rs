//! Public wire contracts only: no database, actor, engine, or transport dependencies.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

mod registry;
pub use registry::{
    client_contracts, decode, decode_client, decode_server, server_contracts, validate,
};

pub const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Empty {}

/// Sent before a graceful restart or stop closes the connection.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Restart {
    /// HTML explaining the downtime, present only when an administrator gave a reason.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LobbyStatus {
    Loading {
        total_games: (),
    },
    Error {
        total_games: (),
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "String")]
        message: Option<String>,
    },
    Ready {
        #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
        total_games: i64,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "TableID"))]
pub struct TableId(#[schemars(range(min = 0, max = MAX_SAFE_INTEGER))] pub u64);

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatRequest {
    #[schemars(length(min = 1))]
    pub msg: String,
    #[schemars(length(min = 1))]
    pub room: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatPmRequest {
    #[schemars(length(min = 1))]
    pub msg: String,
    #[schemars(length(min = 1))]
    pub recipient: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistoryRequest {
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub amount: i64,
    #[serde(default, rename = "beforeID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub before_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub room: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub username: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
#[schemars(extend("x-undefined-default" = ChatUserRequest::default()))]
pub struct ChatUserRequest {
    pub name: String,
    pub room: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
#[schemars(extend("x-undefined-default" = ChatLinkedRequest::default()))]
pub struct ChatLinkedRequest {
    pub room: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableJoinRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub password: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableLeaderRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub name: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct VariantChoice {
    pub variant_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableVariantRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub options: VariantChoice,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableCommand {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStartRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub intended_variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<String>", length(max = 6))]
    pub intended_players: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRestartRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub hide_pregame: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSuggestRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub segment: i64,
}

fn negative_one() -> i64 {
    -1
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSpectateRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default = "negative_one")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub shadowing_player_index: i64,
}

/// A turn in an ongoing game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// 0 plays, 1 discards, 2 gives a color clue, and 3 gives a rank clue.
    #[serde(rename = "type")]
    #[schemars(extend("enum" = [0, 1, 2, 3]))]
    pub kind: u8,
    /// The card order for a play or discard; the player index for a clue.
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub target: i32,
    /// The clue's color index or rank.
    #[serde(default)]
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub value: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PauseRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// "pause", "unpause", or "pause-queue".
    pub setting: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub order: u64,
    pub note: String,
}

/// Adds or removes one tag on the table's game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub msg: String,
    #[serde(default)]
    pub room: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagsDeleteAllRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub room: String,
}

/// A shared-replay leader's action. Which fields matter depends on `type`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayActionRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// 0 segment, 1 arrow, 2 sound, 3 start hypothetical, 4 end hypothetical,
    /// 5 hypothetical action, 6 hypothetical back, 7 toggle drawn cards, 8 efficiency modifier.
    #[serde(rename = "type")]
    #[schemars(range(min = 0, max = 8))]
    pub kind: u8,
    #[serde(default)]
    #[schemars(range(min = 0, max = i32::MAX))]
    pub segment: i32,
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub order: i64,
    #[serde(default)]
    pub sound: String,
    #[serde(default)]
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub value: i32,
    /// A client game action, as JSON text, for a hypothetical action.
    #[serde(default, rename = "actionJSON")]
    #[schemars(length(max = 65_536))]
    pub action_json: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ChatSource {
    User,
    Server,
    Discord,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Chat {
    /// Pre-escaped HTML, not an instruction to escape or normalize again.
    #[schemars(length(min = 1))]
    pub msg: String,
    pub source: ChatSource,
    #[schemars(length(min = 1))]
    pub datetime: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub who: Option<String>,
    #[serde(default, rename = "chatID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: Option<i64>,
    #[serde(default, rename = "pmID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 1, max = MAX_SAFE_INTEGER))]
    pub pm_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub room: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub recipient: Option<String>,
}

impl Chat {
    pub fn new(msg: impl Into<String>, source: ChatSource, datetime: impl Into<String>) -> Self {
        Self {
            msg: msg.into(),
            source,
            datetime: datetime.into(),
            who: None,
            chat_id: None,
            pm_id: None,
            room: None,
            recipient: None,
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
    #[serde(rename = "pmID")]
    #[schemars(range(min = 1, max = MAX_SAFE_INTEGER))]
    pub pm_id: i64,
    #[schemars(length(min = 1))]
    pub msg: String,
    #[schemars(length(min = 1))]
    pub who: String,
    #[schemars(length(min = 1))]
    pub recipient: String,
    #[schemars(length(min = 1))]
    pub datetime: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistory {
    #[schemars(extend("x-readonly" = true))]
    pub list: Vec<ChatHistoryMessage>,
    pub has_more: bool,
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

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStarted {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub replay: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "UserID"))]
pub struct UserId(#[schemars(range(min = 0, max = 2_147_483_647))] pub i32);

/// A user's presence in the lobby's user list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct User {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    #[schemars(length(min = 1))]
    pub name: String,
    /// The `Status` enum: lobby, pregame, playing, spectating, replay, or shared replay.
    #[schemars(
        range(min = 0, max = 5),
        extend("enum" = [0, 1, 2, 3, 4, 5], "x-enum" = "Status")
    )]
    pub status: u8,
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
    pub hyphenated: bool,
    pub inactive: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-readonly" = true))]
pub struct UserList(pub Vec<User>);

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct UserLeft {
    #[serde(rename = "userID")]
    pub user_id: UserId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct UserInactive {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    pub inactive: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Friends {
    #[schemars(extend("x-readonly" = true))]
    pub friends: Vec<String>,
}

/// A problem the client shows in a modal. The text may contain HTML.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ErrorNotice {
    #[schemars(length(min = 1))]
    pub error: String,
}

/// A recoverable problem the client shows in a modal. The text may contain HTML.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Warning {
    #[schemars(length(min = 1))]
    pub warning: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct SoundLobby {
    #[schemars(length(min = 1))]
    pub file: String,
}

pub fn schemas() -> std::collections::BTreeMap<String, serde_json::Value> {
    let mut schemas = std::collections::BTreeMap::new();
    macro_rules! register {
        ($($ty:ty),+ $(,)?) => {$(
            schemas.insert(stringify!($ty).into(), serde_json::to_value(schemars::schema_for!($ty)).unwrap());
        )+};
    }
    register!(
        ChatRequest,
        ChatPmRequest,
        ChatHistoryRequest,
        ChatUserRequest,
        ChatLinkedRequest,
        TableId,
        TableRequest,
        TableJoinRequest,
        TableLeaderRequest,
        TableVariantRequest,
        TableCommand,
        TableStartRequest,
        TableRestartRequest,
        TableSuggestRequest,
        TableSpectateRequest,
        ActionRequest,
        PauseRequest,
        NoteRequest,
        TagRequest,
        TagsDeleteAllRequest,
        ReplayActionRequest,
        Chat,
        ChatDelete,
        ChatList,
        ChatHistoryMessage,
        ChatHistory,
        ChatTyping,
        TableStarted,
        Empty,
        Restart,
        LobbyStatus,
        UserId,
        User,
        UserList,
        UserLeft,
        UserInactive,
        Friends,
        ErrorNotice,
        Warning,
        SoundLobby,
    );
    schemas
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    #[test]
    fn cross_language_fixtures_preserve_acceptance_and_normalization() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../fixtures/compatibility.json")).unwrap();
        for case in cases {
            let command = case["command"].as_str().unwrap();
            let result = if case["direction"] == "client" {
                decode_client(command, &case["input"])
            } else {
                decode_server(command, &case["input"])
            };
            let valid = case["nativeValid"]
                .as_bool()
                .unwrap_or(case["valid"].as_bool().unwrap());
            assert_eq!(result.is_ok(), valid, "{}", case["name"]);
            if let Ok(data) = result {
                let data = data.expect("Fixture must exercise a registered wire contract");
                assert_eq!(
                    data,
                    case.get("normalized").unwrap_or(&case["input"]).clone(),
                    "{}",
                    case["name"]
                );
            }
        }
    }

    #[test]
    fn optional_values_are_omitted_not_null() {
        let error = decode::<ChatRequest>(&json!({
            "msg": "private text", "room": null
        }))
        .unwrap_err();
        assert!(!format!("{error:#}").contains("private text"));
        let data = decode::<ChatRequest>(&json!({"msg":"hello","room":"lobby"})).unwrap();
        assert_eq!(
            serde_json::to_value(data).unwrap(),
            json!({"msg":"hello","room":"lobby"})
        );
    }
}
