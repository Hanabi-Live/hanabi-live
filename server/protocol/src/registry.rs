// Clippy skips wildcard_imports in test builds, where the expectation would go unfulfilled.
#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the command tables below name every payload type"
    )
)]
use crate::*;
use anyhow::{Context, Result, bail};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{
    any::TypeId,
    collections::{BTreeMap, BTreeSet, HashMap},
    marker::PhantomData,
    sync::{Arc, LazyLock, PoisonError, RwLock},
};

macro_rules! client_contracts {
    ($apply:ident) => {
        $apply! {
            LobbyLoad "lobbyLoad" => Empty;
            Sync "sync" => Empty;
            Chat "chat" => ChatRequest;
            ChatPM "chatPM" => ChatPmRequest;
            ChatPMHistory "chatPMHistory" => ChatHistoryRequest;
            ChatFriend "chatFriend" => ChatUserRequest;
            ChatUnfriend "chatUnfriend" => ChatUserRequest;
            ChatLink "chatLink" => ChatUserRequest;
            ChatUnlink "chatUnlink" => ChatUserRequest;
            ChatLinked "chatLinked" => ChatLinkedRequest;
            ChatBlock "chatBlock" => ChatUserRequest;
            ChatUnblock "chatUnblock" => ChatUserRequest;
            ChatBlocked "chatBlocked" => ChatLinkedRequest;
            ChatRead "chatRead" => TableRequest;
            ChatTyping "chatTyping" => TableRequest;
            TableJoin "tableJoin" => TableJoinRequest;
            TableLeave "tableLeave" => TableRequest;
            TableReattend "tableReattend" => TableRequest;
            TableSetLeader "tableSetLeader" => TableLeaderRequest;
            TableSetVariant "tableSetVariant" => TableVariantRequest;
            TableStart "tableStart" => TableStartRequest;
            TableRestart "tableRestart" => TableRestartRequest;
            TableRestartDecline "tableRestartDecline" => TableRestartDeclineRequest;
            TableSuggest "tableSuggest" => TableSuggestRequest;
            TableSpectate "tableSpectate" => TableSpectateRequest;
            TableUnattend "tableUnattend" => TableRequest;
            TableTerminate "tableTerminate" => TableRequest;
            TableVoteForTermination "tableVoteForTermination" => TableRequest;
            GetGameInit "getGameInit" => TableRequest;
            GetGameState "getGameState" => TableRequest;
            Loaded "loaded" => TableRequest;
            Setting "setting" => SettingRequest;
            Inactive "inactive" => InactiveRequest;
            GameHistory "gameHistory" => HistoryRequest;
            GameHistoryOtherScores "gameHistoryOtherScores" => HistorySeedRequest;
            TagSearch "tagSearch" => TagSearchRequest;
            TableCreate "tableCreate" => TableCreateRequest;
            TableUpdate "tableUpdate" => TableUpdateRequest;
            ReplayCreate "replayCreate" => ReplayCreateRequest;
            PlayerAction "playerAction" => PlayerActionRequest;
            Pause "pause" => PauseRequest;
            IdleReset "idleReset" => TableRequest;
            Note "note" => NoteRequest;
            Tag "tag" => TagRequest;
            TagDelete "tagDelete" => TagRequest;
            TagsDeleteAll "tagsDeleteAll" => TableRequest;
            ReplayAction "replayAction" => SharedReplayAction;
        }
    };
}

macro_rules! server_contracts {
    ($apply:ident) => {
        $apply! {
            RESTART "restart" => Restart;
            CLOCK "clock" => Clock;
            CONNECTED "connected" => Connected;
            PAUSE "pause" => Pause;
            IDLE_WARNING "idleWarning" => IdleWarning;
            IDLE_RESET "idleReset" => TableRequest;
            VOTE_CHANGE "voteChange" => VoteChange;
            CARD_IDENTITIES "cardIdentities" => CardIdentities;
            FINISH_ONGOING_GAME "finishOngoingGame" => FinishOngoingGame;
            REPLAY_ACTION "replayAction" => SharedReplayAction;
            REPLAY_LEADER "replayLeader" => ReplayLeader;
            RESTART_DECLINED "restartDeclined" => RestartDeclined;
            SUGGESTION "suggestion" => Suggestion;
            HYPOTHETICAL "hypothetical" => Hypothetical;
            NOTE "note" => Note;
            NOTE_LIST "noteList" => NoteList;
            NOTE_LIST_PLAYER "noteListPlayer" => NoteListPlayer;
            GAME_EVENT "gameEvent" => GameEventMessage;
            GAME_EVENT_LIST "gameEventList" => GameEventList;
            INIT "init" => Init;
            BOOT "boot" => TableRequest;
            SYNCED "synced" => Empty;
            LOBBY_STATUS "lobbyStatus" => LobbyStatus;
            CHAT "chat" => Chat;
            CHAT_DELETE "chatDelete" => ChatDelete;
            CHAT_LIST "chatList" => ChatList;
            CHAT_PM_HISTORY "chatPMHistory" => ChatHistory;
            CHAT_TYPING "chatTyping" => ChatTyping;
            JOINED "joined" => TableRequest;
            LEFT "left" => TableRequest;
            TABLE_GONE "tableGone" => TableRequest;
            TABLE_STARTED "tableStarted" => TableStarted;
            USER "user" => User;
            USER_LIST "userList" => UserList;
            USER_LEFT "userLeft" => UserLeft;
            USER_INACTIVE "userInactive" => UserInactive;
            FRIENDS "friends" => Friends;
            BLOCKED "blocked" => Blocked;
            ERROR "error" => Notice;
            OUTDATED_CLIENT "outdatedClient" => Empty;
            WARNING "warning" => Notice;
            SOUND_LOBBY "soundLobby" => SoundLobby;
            WELCOME "welcome" => Welcome;
            SPECTATORS "spectators" => Spectators;
            TABLE "table" => Table;
            TABLE_LIST "tableList" => TableList;
            PREGAME "pregame" => Pregame;
            GAME_HISTORY "gameHistory" => GameHistoryList;
            GAME_HISTORY_ADDED "gameHistoryAdded" => GameHistory;
            GAME_HISTORY_OTHER_SCORES "gameHistoryOtherScores" => GameHistoryOtherScores;
        }
    };
}

/// The types that the data package exports a schema for besides the command payloads: types that
/// clients name, and the bodies of the HTTP routes that clients use.
macro_rules! exported_types {
    ($apply:ident) => {
        $apply! {
            TableId, GameId, UserId, Settings, Spectator, GameHistory,
            ReplayGame, ReplayBoardElement, ReplaySoundEffect, Status, LoginRequest,
            LoginResponse, ApiError, PasswordHashRequest, PasswordHashResponse, PublicGamePage,
            VariantNames, ScoreFrequency,
        }
    };
}

/// The types that only the game library exports: the entries of the game catalog's files, and the
/// clue types that the game state names.
macro_rules! game_library_types {
    ($apply:ident) => {
        $apply! { CatalogColor, CatalogSuit, CatalogVariant, CatalogCharacter, ClueType }
    };
}

/// Every schema that the TypeScript generator can write, keyed by type name: the command payloads,
/// the exported types, and the game library's types, each with the schemas it references.
pub fn schemas() -> BTreeMap<String, Value> {
    let mut schemas = BTreeMap::new();
    macro_rules! insert {
        ($($ty:ty),+ $(,)?) => {$(
            schemas.insert(
                stringify!($ty).to_owned(),
                serde_json::to_value(schemars::schema_for!($ty))
                    .expect("A schema serializes to JSON"),
            );
        )+};
    }
    macro_rules! payloads {
        ($($name:ident $command:literal => $payload:ty;)+) => { insert!($($payload),+); };
    }
    client_contracts!(payloads);
    server_contracts!(payloads);
    exported_types!(insert);
    game_library_types!(insert);
    schemas
}

/// The names of the types that the data package exports: the command payloads and the exported
/// types.
pub fn exported() -> BTreeSet<&'static str> {
    macro_rules! names {
        ($($ty:ident),+ $(,)?) => { [$(stringify!($ty)),+] };
    }
    client_contracts()
        .into_values()
        .chain(server_contracts().into_values())
        .chain(exported_types!(names))
        .collect()
}

/// Each type's validator, built when the type is first validated.
static VALIDATORS: LazyLock<RwLock<HashMap<TypeId, Arc<jsonschema::Validator>>>> =
    LazyLock::new(RwLock::default);

fn validator<T: JsonSchema + 'static>() -> Arc<jsonschema::Validator> {
    let id = TypeId::of::<T>();
    if let Some(validator) = VALIDATORS
        .read()
        .unwrap_or_else(PoisonError::into_inner)
        .get(&id)
    {
        return Arc::clone(validator);
    }
    let schema =
        serde_json::to_value(schemars::schema_for!(T)).expect("A schema serializes to JSON");
    let validator = Arc::new(
        jsonschema::options()
            .should_validate_formats(true)
            .build(&schema)
            .expect("Wire DTO schemas must be valid"),
    );
    Arc::clone(
        VALIDATORS
            .write()
            .unwrap_or_else(PoisonError::into_inner)
            .entry(id)
            .or_insert(validator),
    )
}

/// Validate before deserializing: serde's Option alone would accept explicit null.
pub fn validate<T: JsonSchema + 'static>(value: &Value) -> Result<()> {
    if let Err(error) = validator::<T>().validate(value) {
        // Do not put private message contents in parser errors or logs.
        bail!(
            "Invalid {} payload at {}",
            T::schema_name(),
            error.instance_path()
        );
    }
    Ok(())
}

pub fn decode<T: JsonSchema + DeserializeOwned + 'static>(value: &Value) -> Result<T> {
    validate::<T>(value)?;
    T::deserialize(value).with_context(|| format!("Invalid {} representation", T::schema_name()))
}

pub fn decode_server(name: &str, value: &Value) -> Result<Option<Value>> {
    macro_rules! dispatch {
        ($($name:ident $command:literal => $payload:ty;)+) => {
            match name {
                $($command => Ok(Some(serde_json::to_value(decode::<$payload>(value)?)?)),)+
                _ => Ok(None),
            }
        };
    }
    server_contracts!(dispatch)
}

pub fn client_contracts() -> BTreeMap<&'static str, &'static str> {
    macro_rules! names {
        ($($name:ident $command:literal => $payload:ty;)+) => {
            BTreeMap::from([$(( $command, stringify!($payload) )),+])
        };
    }
    client_contracts!(names)
}

pub fn server_contracts() -> BTreeMap<&'static str, &'static str> {
    macro_rules! names {
        ($($name:ident $command:literal => $payload:ty;)+) => {
            BTreeMap::from([$(( $command, stringify!($payload) )),+])
        };
    }
    server_contracts!(names)
}

/// A registered server message: its name, tied to the payload type the clients validate.
pub struct ServerMessage<T> {
    name: &'static str,
    payload: PhantomData<fn(T)>,
}

impl<T> ServerMessage<T> {
    const fn new(name: &'static str) -> Self {
        Self {
            name,
            payload: PhantomData,
        }
    }

    pub const fn name(&self) -> &'static str {
        self.name
    }
}

impl<T> Clone for ServerMessage<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Copy for ServerMessage<T> {}

macro_rules! server_messages {
    ($($name:ident $command:literal => $payload:ty;)+) => {
        $(pub const $name: ServerMessage<$payload> = ServerMessage::new($command);)+
    };
}

/// Every message the server can send. Building a frame requires one of these and its payload type.
pub mod server {
    use super::{
        Blocked, CardIdentities, Chat, ChatDelete, ChatHistory, ChatList, ChatTyping, Clock,
        Connected, Empty, FinishOngoingGame, Friends, GameEventList, GameEventMessage, GameHistory,
        GameHistoryList, GameHistoryOtherScores, Hypothetical, IdleWarning, Init, LobbyStatus,
        Note, NoteList, NoteListPlayer, Notice, Pause, Pregame, ReplayLeader, Restart,
        RestartDeclined, ServerMessage, SharedReplayAction, SoundLobby, Spectators, Suggestion,
        Table, TableList, TableRequest, TableStarted, User, UserInactive, UserLeft, UserList,
        VoteChange, Welcome,
    };
    server_contracts!(server_messages);
}

macro_rules! client_messages {
    ($($name:ident $command:literal => $payload:ty;)+) => {
        /// A client command, decoded once into its payload type. Matching on it, rather than on
        /// command names, lets the compiler check that every command is handled.
        #[derive(Clone, Debug)]
        pub enum ClientMessage {
            $($name($payload),)+
        }

        impl ClientMessage {
            /// Validates and decodes a command, or returns None for an unregistered name.
            pub fn decode(name: &str, value: &Value) -> Result<Option<Self>> {
                match name {
                    $($command => Ok(Some(Self::$name(decode::<$payload>(value)?))),)+
                    _ => Ok(None),
                }
            }

            pub const fn name(&self) -> &'static str {
                match self {
                    $(Self::$name(_) => $command,)+
                }
            }

            /// The payload as JSON, as the server normalizes it.
            pub fn data(&self) -> Value {
                match self {
                    $(Self::$name(data) => {
                        serde_json::to_value(data).expect("JSON-serializable client payload")
                    })+
                }
            }
        }
    };
}

client_contracts!(client_messages);
