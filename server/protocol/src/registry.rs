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
use std::{collections::BTreeMap, marker::PhantomData, sync::LazyLock};

macro_rules! client_contracts {
    ($apply:ident) => {
        $apply! {
            LobbyLoad "lobbyLoad" => Empty;
            Sync "sync" => Empty;
            Chat "chat" => ChatRequest;
            ChatPM "chatPM" => ChatPmRequest;
            ChatPMHistoryGet "chatPMHistoryGet" => ChatHistoryRequest;
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
            TableUnattend "tableUnattend" => TableCommand;
            TableTerminate "tableTerminate" => TableCommand;
            TableVoteForTermination "tableVoteForTermination" => TableCommand;
            GetGameInfo1 "getGameInfo1" => TableCommand;
            GetGameInfo2 "getGameInfo2" => TableCommand;
            Loaded "loaded" => TableCommand;
            Setting "setting" => SettingRequest;
            Inactive "inactive" => InactiveRequest;
            HistoryGet "historyGet" => HistoryRequest;
            HistoryGetSeed "historyGetSeed" => HistorySeedRequest;
            TagSearch "tagSearch" => TagSearchRequest;
            TableCreate "tableCreate" => TableCreateRequest;
            TableUpdate "tableUpdate" => TableUpdateRequest;
            ReplayCreate "replayCreate" => ReplayCreateRequest;
            Action "action" => ActionRequest;
            Pause "pause" => PauseRequest;
            IdleReset "idleReset" => TableRequest;
            Note "note" => NoteRequest;
            Tag "tag" => TagRequest;
            TagDelete "tagDelete" => TagRequest;
            TagsDeleteAll "tagsDeleteAll" => TagsDeleteAllRequest;
            ReplayAction "replayAction" => ReplayActionRequest;
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
            REPLAY_SEGMENT "replaySegment" => ReplaySegment;
            REPLAY_INDICATOR "replayIndicator" => ReplayIndicator;
            REPLAY_SOUND "replaySound" => ReplaySound;
            REPLAY_LEADER "replayLeader" => ReplayLeader;
            RESTART_DECLINED "restartDeclined" => RestartDeclined;
            SUGGESTION "suggestion" => Suggestion;
            HYPOTHETICAL "hypothetical" => Hypothetical;
            HYPO_START "hypoStart" => TableRequest;
            HYPO_END "hypoEnd" => TableRequest;
            HYPO_BACK "hypoBack" => TableRequest;
            HYPO_ACTION "hypoAction" => HypotheticalAction;
            HYPO_SHOW_DRAWN_CARDS "hypoShowDrawnCards" => HypoShowDrawnCards;
            NOTE "note" => Note;
            NOTE_LIST "noteList" => NoteList;
            NOTE_LIST_PLAYER "noteListPlayer" => NoteListPlayer;
            GAME_ACTION "gameAction" => GameAction;
            GAME_ACTION_LIST "gameActionList" => GameActionList;
            INIT "init" => Init;
            REPLAY_EFFICIENCY_MOD "replayEfficiencyMod" => ReplayEfficiencyMod;
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
            TABLE_START "tableStart" => TableStarted;
            USER "user" => User;
            USER_LIST "userList" => UserList;
            USER_LEFT "userLeft" => UserLeft;
            USER_INACTIVE "userInactive" => UserInactive;
            FRIENDS "friends" => Friends;
            ERROR "error" => ErrorNotice;
            WARNING "warning" => Warning;
            SOUND_LOBBY "soundLobby" => SoundLobby;
            WELCOME "welcome" => Welcome;
            SPECTATORS "spectators" => Spectators;
            TABLE "table" => Table;
            TABLE_LIST "tableList" => TableList;
            GAME "game" => Pregame;
            GAME_HISTORY "gameHistory" => GameHistoryList;
            GAME_HISTORY_OTHER_SCORES "gameHistoryOtherScores" => GameHistoryOtherScores;
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
        CardIdentities, Chat, ChatDelete, ChatHistory, ChatList, ChatTyping, Clock, Connected,
        Empty, ErrorNotice, FinishOngoingGame, Friends, GameAction, GameActionList,
        GameHistoryList, GameHistoryOtherScores, HypoShowDrawnCards, Hypothetical,
        HypotheticalAction, IdleWarning, Init, LobbyStatus, Note, NoteList, NoteListPlayer, Pause,
        Pregame, ReplayEfficiencyMod, ReplayIndicator, ReplayLeader, ReplaySegment, ReplaySound,
        Restart, RestartDeclined, ServerMessage, SoundLobby, Spectators, Suggestion, Table,
        TableList, TableRequest, TableStarted, User, UserInactive, UserLeft, UserList, VoteChange,
        Warning, Welcome,
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
