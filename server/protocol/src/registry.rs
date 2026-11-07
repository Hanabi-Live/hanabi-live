use crate::*;
use anyhow::{Context, Result, bail};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{collections::BTreeMap, marker::PhantomData, sync::LazyLock};

macro_rules! client_contracts {
    ($apply:ident) => {
        $apply! {
            "lobbyLoad" => Empty, Empty;
            "sync" => Empty, Empty;
            "chat" => ChatRequest, ChatRequest;
            "chatPM" => ChatPmRequest, ChatPmRequest;
            "chatPMHistoryGet" => ChatHistoryRequest, ChatHistoryRequest;
            "chatFriend" => ChatUserRequest, ChatUserRequest;
            "chatUnfriend" => ChatUserRequest, ChatUserRequest;
            "chatLink" => ChatUserRequest, ChatUserRequest;
            "chatUnlink" => ChatUserRequest, ChatUserRequest;
            "chatPlayerInfo" => ChatUserRequest, ChatUserRequest;
            "chatLinked" => ChatLinkedRequest, ChatLinkedRequest;
            "chatRead" => TableRequest, TableRequest;
            "chatTyping" => TableRequest, TableRequest;
            "tableJoin" => TableJoinRequest, TableJoinRequest;
            "tableLeave" => TableRequest, TableRequest;
            "tableReattend" => TableRequest, TableRequest;
            "tableSetLeader" => TableLeaderRequest, TableLeaderRequest;
            "tableSetVariant" => TableVariantRequest, TableVariantRequest;
            "tableStart" => TableStartRequest, TableStartRequest;
            "tableRestart" => TableRestartRequest, TableRestartRequest;
            "tableSuggest" => TableSuggestRequest, TableSuggestRequest;
            "tableSpectate" => TableSpectateRequest, TableSpectateRequest;
            "tableUnattend" => TableCommand, TableCommand;
            "tableTerminate" => TableCommand, TableCommand;
            "tableVoteForTermination" => TableCommand, TableCommand;
            "getGameInfo1" => TableCommand, TableCommand;
            "getGameInfo2" => TableCommand, TableCommand;
            "loaded" => TableCommand, TableCommand;
            "setting" => SettingRequest, SettingRequest;
            "inactive" => InactiveRequest, InactiveRequest;
            "historyGet" => HistoryRequest, HistoryRequest;
            "historyGetSeed" => HistorySeedRequest, HistorySeedRequest;
            "tagSearch" => TagSearchRequest, TagSearchRequest;
            "tableCreate" => TableCreateRequest, TableCreateRequest;
            "tableUpdate" => TableUpdateRequest, TableUpdateRequest;
            "replayCreate" => ReplayCreateRequest, ReplayCreateRequest;
            "action" => ActionRequest, ActionRequest;
            "pause" => PauseRequest, PauseRequest;
            "note" => NoteRequest, NoteRequest;
            "tag" => TagRequest, TagRequest;
            "tagDelete" => TagRequest, TagRequest;
            "tagsDeleteAll" => TagsDeleteAllRequest, TagsDeleteAllRequest;
            "replayAction" => ReplayActionRequest, ReplayActionRequest;
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
        ($($command:literal => $canonical:ty, $native:ty;)+) => {
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
        ($($command:literal => $canonical:ty, $native:ty;)+) => {
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
