use crate::*;
use anyhow::{Context, Result, bail};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{collections::BTreeMap, marker::PhantomData, sync::LazyLock};

macro_rules! client_contracts {
    ($apply:ident) => {
        $apply! {
            LobbyLoad "lobbyLoad" => Empty, Empty;
            Sync "sync" => Empty, Empty;
            Chat "chat" => ChatRequest, ChatRequest;
            ChatPM "chatPM" => ChatPmRequest, ChatPmRequest;
            ChatPMHistoryGet "chatPMHistoryGet" => ChatHistoryRequest, ChatHistoryRequest;
            ChatFriend "chatFriend" => ChatUserRequest, ChatUserRequest;
            ChatUnfriend "chatUnfriend" => ChatUserRequest, ChatUserRequest;
            ChatLink "chatLink" => ChatUserRequest, ChatUserRequest;
            ChatUnlink "chatUnlink" => ChatUserRequest, ChatUserRequest;
            ChatPlayerInfo "chatPlayerInfo" => ChatUserRequest, ChatUserRequest;
            ChatLinked "chatLinked" => ChatLinkedRequest, ChatLinkedRequest;
            ChatRead "chatRead" => TableRequest, TableRequest;
            ChatTyping "chatTyping" => TableRequest, TableRequest;
            TableJoin "tableJoin" => TableJoinRequest, TableJoinRequest;
            TableLeave "tableLeave" => TableRequest, TableRequest;
            TableReattend "tableReattend" => TableRequest, TableRequest;
            TableSetLeader "tableSetLeader" => TableLeaderRequest, TableLeaderRequest;
            TableSetVariant "tableSetVariant" => TableVariantRequest, TableVariantRequest;
            TableStart "tableStart" => TableStartRequest, TableStartRequest;
            TableRestart "tableRestart" => TableRestartRequest, TableRestartRequest;
            TableSuggest "tableSuggest" => TableSuggestRequest, TableSuggestRequest;
            TableSpectate "tableSpectate" => TableSpectateRequest, TableSpectateRequest;
            TableUnattend "tableUnattend" => TableCommand, TableCommand;
            TableTerminate "tableTerminate" => TableCommand, TableCommand;
            TableVoteForTermination "tableVoteForTermination" => TableCommand, TableCommand;
            GetGameInfo1 "getGameInfo1" => TableCommand, TableCommand;
            GetGameInfo2 "getGameInfo2" => TableCommand, TableCommand;
            Loaded "loaded" => TableCommand, TableCommand;
            Setting "setting" => SettingRequest, SettingRequest;
            Inactive "inactive" => InactiveRequest, InactiveRequest;
            HistoryGet "historyGet" => HistoryRequest, HistoryRequest;
            HistoryGetSeed "historyGetSeed" => HistorySeedRequest, HistorySeedRequest;
            TagSearch "tagSearch" => TagSearchRequest, TagSearchRequest;
            TableCreate "tableCreate" => TableCreateRequest, TableCreateRequest;
            TableUpdate "tableUpdate" => TableUpdateRequest, TableUpdateRequest;
            ReplayCreate "replayCreate" => ReplayCreateRequest, ReplayCreateRequest;
            Action "action" => ActionRequest, ActionRequest;
            Pause "pause" => PauseRequest, PauseRequest;
            Note "note" => NoteRequest, NoteRequest;
            Tag "tag" => TagRequest, TagRequest;
            TagDelete "tagDelete" => TagRequest, TagRequest;
            TagsDeleteAll "tagsDeleteAll" => TagsDeleteAllRequest, TagsDeleteAllRequest;
            ReplayAction "replayAction" => ReplayActionRequest, ReplayActionRequest;
        }
    };
}

macro_rules! server_contracts {
    ($apply:ident) => {
        $apply! {
            RESTART "restart" => Restart, Restart;
            CLOCK "clock" => Clock, Clock;
            CONNECTED "connected" => Connected, Connected;
            PAUSE "pause" => Pause, Pause;
            VOTE_CHANGE "voteChange" => VoteChange, VoteChange;
            CARD_IDENTITIES "cardIdentities" => CardIdentities, CardIdentities;
            FINISH_ONGOING_GAME "finishOngoingGame" => FinishOngoingGame, FinishOngoingGame;
            REPLAY_SEGMENT "replaySegment" => ReplaySegment, ReplaySegment;
            REPLAY_INDICATOR "replayIndicator" => ReplayIndicator, ReplayIndicator;
            REPLAY_SOUND "replaySound" => ReplaySound, ReplaySound;
            REPLAY_LEADER "replayLeader" => ReplayLeader, ReplayLeader;
            SUGGESTION "suggestion" => Suggestion, Suggestion;
            HYPOTHETICAL "hypothetical" => Hypothetical, Hypothetical;
            HYPO_START "hypoStart" => TableRequest, TableRequest;
            HYPO_END "hypoEnd" => TableRequest, TableRequest;
            HYPO_BACK "hypoBack" => TableRequest, TableRequest;
            HYPO_ACTION "hypoAction" => HypoAction, HypoAction;
            HYPO_SHOW_DRAWN_CARDS "hypoShowDrawnCards" => HypoShowDrawnCards, HypoShowDrawnCards;
            NOTE "note" => Note, Note;
            NOTE_LIST "noteList" => NoteList, NoteList;
            NOTE_LIST_PLAYER "noteListPlayer" => NoteListPlayer, NoteListPlayer;
            GAME_ACTION "gameAction" => GameAction, GameAction;
            GAME_ACTION_LIST "gameActionList" => GameActionList, GameActionList;
            INIT "init" => Init, Init;
            REPLAY_EFFICIENCY_MOD "replayEfficiencyMod" => ReplayEfficiencyMod, ReplayEfficiencyMod;
            BOOT "boot" => TableRequest, TableRequest;
            SYNCED "synced" => Empty, Empty;
            LOBBY_STATUS "lobbyStatus" => LobbyStatus, LobbyStatus;
            CHAT "chat" => Chat, Chat;
            CHAT_DELETE "chatDelete" => ChatDelete, ChatDelete;
            CHAT_LIST "chatList" => ChatList, ChatList;
            CHAT_PM_HISTORY "chatPMHistory" => ChatHistory, ChatHistory;
            CHAT_TYPING "chatTyping" => ChatTyping, ChatTyping;
            JOINED "joined" => TableRequest, TableRequest;
            LEFT "left" => TableRequest, TableRequest;
            TABLE_GONE "tableGone" => TableRequest, TableRequest;
            TABLE_START "tableStart" => TableStarted, TableStarted;
            USER "user" => User, User;
            USER_LIST "userList" => UserList, UserList;
            USER_LEFT "userLeft" => UserLeft, UserLeft;
            USER_INACTIVE "userInactive" => UserInactive, UserInactive;
            FRIENDS "friends" => Friends, Friends;
            ERROR "error" => ErrorNotice, ErrorNotice;
            WARNING "warning" => Warning, Warning;
            SOUND_LOBBY "soundLobby" => SoundLobby, SoundLobby;
            WELCOME "welcome" => Welcome, Welcome;
            SPECTATORS "spectators" => Spectators, Spectators;
            TABLE "table" => Table, Table;
            TABLE_LIST "tableList" => TableList, TableList;
            GAME "game" => Pregame, Pregame;
            GAME_HISTORY "gameHistory" => GameHistoryList, GameHistoryList;
            GAME_HISTORY_OTHER_SCORES "gameHistoryOtherScores" => GameHistoryOtherScores, GameHistoryOtherScores;
        }
    };
}

static VALIDATORS: LazyLock<BTreeMap<String, jsonschema::Validator>> = LazyLock::new(|| {
    schemas()
        .into_iter()
        .map(|(name, schema)| {
            let validator = jsonschema::options()
                .should_validate_formats(true)
                .build(&schema)
                .expect("Wire DTO schemas must be valid");
            (name, validator)
        })
        .collect()
});

/// Validate before deserializing: serde's Option alone would accept explicit null.
pub fn validate<T: JsonSchema>(value: &Value) -> Result<()> {
    let name = T::schema_name();
    let validator = VALIDATORS
        .get(name.as_ref())
        .context("Unregistered wire DTO")?;
    if let Err(error) = validator.validate(value) {
        // Do not put private message contents in parser errors or logs.
        bail!("Invalid {name} payload at {}", error.instance_path());
    }
    Ok(())
}

pub fn decode<T: JsonSchema + DeserializeOwned>(value: &Value) -> Result<T> {
    validate::<T>(value)?;
    T::deserialize(value).with_context(|| format!("Invalid {} representation", T::schema_name()))
}

pub fn decode_client(name: &str, value: &Value) -> Result<Option<Value>> {
    macro_rules! dispatch {
        ($($name:ident $command:literal => $canonical:ty, $native:ty;)+) => {
            match name {
                $($command => Ok(Some(serde_json::to_value(decode::<$native>(value)?)?)),)+
                _ => Ok(None),
            }
        };
    }
    client_contracts!(dispatch)
}

pub fn decode_server(name: &str, value: &Value) -> Result<Option<Value>> {
    macro_rules! dispatch {
        ($($name:ident $command:literal => $canonical:ty, $native:ty;)+) => {
            match name {
                $($command => Ok(Some(serde_json::to_value(decode::<$native>(value)?)?)),)+
                _ => Ok(None),
            }
        };
    }
    server_contracts!(dispatch)
}

pub fn client_contracts() -> BTreeMap<&'static str, &'static str> {
    macro_rules! names {
        ($($name:ident $command:literal => $canonical:ty, $native:ty;)+) => {
            BTreeMap::from([$(( $command, stringify!($canonical) )),+])
        };
    }
    client_contracts!(names)
}

pub fn server_contracts() -> BTreeMap<&'static str, &'static str> {
    macro_rules! names {
        ($($name:ident $command:literal => $canonical:ty, $native:ty;)+) => {
            BTreeMap::from([$(( $command, stringify!($canonical) )),+])
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
    ($($name:ident $command:literal => $canonical:ty, $native:ty;)+) => {
        $(pub const $name: ServerMessage<$native> = ServerMessage::new($command);)+
    };
}

/// Every message the server can send. Building a frame requires one of these and its payload type.
pub mod server {
    use super::{ServerMessage, *};
    server_contracts!(server_messages);
}

macro_rules! client_messages {
    ($($name:ident $command:literal => $canonical:ty, $native:ty;)+) => {
        /// A client command, decoded once into its payload type. Matching on it, rather than on
        /// command names, lets the compiler check that every command is handled.
        #[derive(Clone, Debug)]
        pub enum ClientMessage {
            $($name($native),)+
        }

        impl ClientMessage {
            /// Validates and decodes a command, or returns None for an unregistered name.
            pub fn decode(name: &str, value: &Value) -> Result<Option<Self>> {
                match name {
                    $($command => Ok(Some(Self::$name(decode::<$native>(value)?))),)+
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
