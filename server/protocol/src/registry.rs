use crate::*;
use anyhow::{Context, Result, bail};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{collections::BTreeMap, sync::LazyLock};

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
            "restart" => Restart, Restart;
            "clock" => Clock, Clock;
            "connected" => Connected, Connected;
            "pause" => Pause, Pause;
            "voteChange" => VoteChange, VoteChange;
            "cardIdentities" => CardIdentities, CardIdentities;
            "finishOngoingGame" => FinishOngoingGame, FinishOngoingGame;
            "replaySegment" => ReplaySegment, ReplaySegment;
            "replayIndicator" => ReplayIndicator, ReplayIndicator;
            "replaySound" => ReplaySound, ReplaySound;
            "replayLeader" => ReplayLeader, ReplayLeader;
            "suggestion" => Suggestion, Suggestion;
            "hypothetical" => Hypothetical, Hypothetical;
            "hypoStart" => TableRequest, TableRequest;
            "hypoEnd" => TableRequest, TableRequest;
            "hypoBack" => TableRequest, TableRequest;
            "hypoAction" => HypoAction, HypoAction;
            "hypoShowDrawnCards" => HypoShowDrawnCards, HypoShowDrawnCards;
            "replayEfficiencyMod" => ReplayEfficiencyMod, ReplayEfficiencyMod;
            "boot" => TableRequest, TableRequest;
            "synced" => Empty, Empty;
            "lobbyStatus" => LobbyStatus, LobbyStatus;
            "chat" => Chat, Chat;
            "chatDelete" => ChatDelete, ChatDelete;
            "chatList" => ChatList, ChatList;
            "chatPMHistory" => ChatHistory, ChatHistory;
            "chatTyping" => ChatTyping, ChatTyping;
            "joined" => TableRequest, TableRequest;
            "left" => TableRequest, TableRequest;
            "tableGone" => TableRequest, TableRequest;
            "tableStart" => TableStarted, TableStarted;
            "user" => User, User;
            "userList" => UserList, UserList;
            "userLeft" => UserLeft, UserLeft;
            "userInactive" => UserInactive, UserInactive;
            "friends" => Friends, Friends;
            "error" => ErrorNotice, ErrorNotice;
            "warning" => Warning, Warning;
            "soundLobby" => SoundLobby, SoundLobby;
            "welcome" => Welcome, Welcome;
            "spectators" => Spectators, Spectators;
            "table" => Table, Table;
            "tableList" => TableList, TableList;
            "game" => Pregame, Pregame;
            "gameHistory" => GameHistoryList, GameHistoryList;
            "gameHistoryOtherScores" => GameHistoryOtherScores, GameHistoryOtherScores;
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
        ($($command:literal => $canonical:ty, $native:ty;)+) => {
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
        ($($command:literal => $canonical:ty, $native:ty;)+) => {
            BTreeMap::from([$(( $command, stringify!($canonical) )),+])
        };
    }
    server_contracts!(names)
}
