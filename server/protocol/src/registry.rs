// Clippy skips wildcard_imports in test builds, where the expectation would go unfulfilled.
#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the contract tables below name every payload type"
    )
)]
use crate::*;
use anyhow::{Context, Result, bail};
use schemars::Schema;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{
    any::TypeId,
    collections::{BTreeMap, BTreeSet, HashMap},
    marker::PhantomData,
    sync::{Arc, LazyLock, PoisonError, RwLock},
};

/// Every client request: its name, its payload, and, for a request whose reply carries data, the
/// name of its reply in `reply` and the reply's payload. Every other reply carries no data.
macro_rules! request_contracts {
    ($apply:ident) => {
        $apply! {
            LobbyLoad "lobbyLoad" => Empty;
            Chat "chat" => ChatRequest;
            ChatPm "chatPm" => ChatPmRequest;
            ChatPmHistory "chatPmHistory" => ChatPmHistoryRequest, reply CHAT_PM_HISTORY: ChatPmHistory;
            FriendAdd "friendAdd" => RelationshipRequest;
            FriendRemove "friendRemove" => RelationshipRequest;
            LinkAdd "linkAdd" => RelationshipRequest;
            LinkRemove "linkRemove" => RelationshipRequest;
            LinkList "linkList" => Empty;
            BlockAdd "blockAdd" => RelationshipRequest;
            BlockRemove "blockRemove" => RelationshipRequest;
            ChatRead "chatRead" => TableRef;
            ChatTyping "chatTyping" => TableRef;
            TableJoin "tableJoin" => TableJoinRequest;
            TableLeave "tableLeave" => TableRef;
            TableReattend "tableReattend" => TableRef;
            TableSetOwner "tableSetOwner" => TableSetOwnerRequest;
            TableStart "tableStart" => TableStartRequest;
            TableRestart "tableRestart" => TableRestartRequest;
            TableRestartDecline "tableRestartDecline" => TableRestartDeclineRequest;
            TableSuggest "tableSuggest" => TableSuggestRequest;
            TableSpectate "tableSpectate" => TableSpectateRequest;
            TableUnattend "tableUnattend" => TableRef;
            TableTerminate "tableTerminate" => TableRef;
            TableTerminateVote "tableTerminateVote" => TableTerminateVoteRequest;
            GameInitLoad "gameInitLoad" => TableRef, reply GAME_INIT: GameInit;
            GameStateLoad "gameStateLoad" => TableRef;
            GameLoaded "gameLoaded" => TableRef;
            Settings "settings" => SettingsRequest;
            UserInactive "userInactive" => UserInactiveRequest;
            GameHistory "gameHistory" => PageRequest, reply GAME_HISTORY: GamePage;
            SeedGames "seedGames" => SeedGamesRequest, reply SEED_GAMES: GamePage;
            TagSearch "tagSearch" => TagSearchRequest;
            TableCreate "tableCreate" => TableCreateRequest;
            TableUpdate "tableUpdate" => TableUpdateRequest;
            ReplayCreate "replayCreate" => ReplayCreateRequest;
            PlayerAction "playerAction" => PlayerActionRequest;
            Pause "pause" => PauseRequest;
            PauseQueue "pauseQueue" => PauseQueueRequest;
            IdleReset "idleReset" => TableRef;
            Note "note" => NoteRequest;
            TagAdd "tagAdd" => TagRequest;
            TagRemove "tagRemove" => TagRequest;
            TagRemoveAll "tagRemoveAll" => TableRef;
            ReplayAction "replayAction" => ReplayAction;
        }
    };
}

/// Every event that the server sends on its own: its name and its payload.
macro_rules! event_contracts {
    ($apply:ident) => {
        $apply! {
            SERVER_RESTART "serverRestart" => ServerRestart;
            CLOCK "clock" => Clock;
            CONNECTIONS "connections" => Connections;
            PAUSE "pause" => Pause;
            IDLE_WARNING "idleWarning" => IdleWarning;
            IDLE_RESET "idleReset" => TableRef;
            VOTES "votes" => Votes;
            GAME_FINISHED "gameFinished" => GameFinished;
            REPLAY_ACTION "replayAction" => ReplayAction;
            TABLE_OWNER "tableOwner" => TableOwner;
            TABLE_RESTART_DECLINERS "tableRestartDecliners" => TableRestartDecliners;
            TABLE_SUGGESTION "tableSuggestion" => TableSuggestion;
            NOTE "note" => Note;
            NOTE_LIST "noteList" => NoteList;
            GAME_EVENT "gameEvent" => GameEventMessage;
            GAME_STATE "gameState" => GameState;
            TABLE_BOOTED "tableBooted" => TableRef;
            LOBBY_STATUS "lobbyStatus" => LobbyStatus;
            CHAT "chat" => Chat;
            CHAT_DELETED "chatDeleted" => ChatDeleted;
            CHAT_LIST "chatList" => ChatList;
            CHAT_TYPING "chatTyping" => ChatTyping;
            TABLE_JOINED "tableJoined" => TableJoined;
            TABLE_LEFT "tableLeft" => TableRef;
            TABLE_REMOVED "tableRemoved" => TableRef;
            USER "user" => User;
            USER_LIST "userList" => UserList;
            USER_REMOVED "userRemoved" => UserRemoved;
            FRIENDS "friends" => Friends;
            BLOCKED "blocked" => Blocked;
            ERROR "error" => Notice;
            WARNING "warning" => Notice;
            WELCOME "welcome" => Welcome;
            SPECTATORS "spectators" => Spectators;
            TABLE "table" => Table;
            TABLE_LIST "tableList" => TableList;
            PREGAME "pregame" => Pregame;
            GAME_HISTORY_ADDED "gameHistoryAdded" => GameSummary;
        }
    };
}

/// The types that the data package exports a schema for besides the request, reply, and event
/// payloads: types that clients name, and the bodies of the HTTP routes that clients use.
macro_rules! exported_types {
    ($apply:ident) => {
        $apply! {
            TableId, GameId, UserId, ChatId, RequestId, Settings, Spectator, GameSummary,
            GamePage,
            ReplayGame, ReplayBoardElement, ReplaySoundEffect, SoundMove, Activity, LoginRequest,
            UserRef, NoticeCode, PasswordHashRequest, PasswordHashResponse,
            VariantNames, ScoreFrequency, GameListColumn,
        }
    };
}

/// The types that the game library exports: the entries of the game catalog's files, and the game
/// state's types. The data package imports these, and the schemas they reference, from the game
/// library instead of writing its own copies.
macro_rules! game_library_types {
    ($apply:ident) => {
        $apply! {
            AuthorNote, AuthorNotes, CatalogCharacter, CatalogColor, CatalogSuit, CatalogVariant,
            CardOrder, CharacterId, GameEvent, GameOptions, HypotheticalEvent, VariantId,
        }
    };
}

/// Removes `null` from the schemas of optional values. Every optional value on the wire is omitted
/// when it is absent, so an explicit null is invalid.
fn omit_null(schema: &mut Schema) {
    schemars::transform::transform_subschemas(&mut omit_null, schema);
    let Some(object) = schema.as_object_mut() else {
        return;
    };
    if let Some(Value::Array(types)) = object.get_mut("type") {
        types.retain(|value| value != "null");
        if let [only] = types.as_slice() {
            let only = only.clone();
            object.insert("type".into(), only);
        }
    }
    let null = serde_json::json!({ "type": "null" });
    if let Some(Value::Array(options)) = object.get("anyOf")
        && options.len() == 2
        && let Some(Value::Object(other)) = options.iter().find(|option| **option != null)
        && options.contains(&null)
    {
        let other = other.clone();
        object.remove("anyOf");
        for (key, value) in other {
            object.entry(key).or_insert(value);
        }
    }
}

/// A type's schema, as both the server's validators and the generated clients use it.
fn schema_value<T: JsonSchema>() -> Value {
    let schema = schemars::generate::SchemaSettings::draft2020_12()
        .with_transform(omit_null)
        .into_generator()
        .into_root_schema_for::<T>();
    serde_json::to_value(schema).expect("A schema serializes to JSON")
}

/// Every schema that the TypeScript generator can write, keyed by type name: the request, reply,
/// and event payloads, the exported types, and the game library's types, each with the schemas
/// that they reference.
pub fn schemas() -> BTreeMap<String, Value> {
    let mut schemas = BTreeMap::new();
    macro_rules! insert {
        () => {};
        ($($ty:ty),+ $(,)?) => {$(
            schemas.insert(
                stringify!($ty).to_owned(),
                schema_value::<$ty>(),
            );
        )+};
    }
    macro_rules! requests {
        ($($name:ident $command:literal => $payload:ty $(, reply $reply:ident: $data:ty)?;)+) => {
            insert!($($payload),+);
            $(insert!($($data)?);)+
        };
    }
    macro_rules! payloads {
        ($($name:ident $command:literal => $payload:ty;)+) => { insert!($($payload),+); };
    }
    request_contracts!(requests);
    event_contracts!(payloads);
    exported_types!(insert);
    game_library_types!(insert);
    schemas
}

/// The names of the types that the data package exports: the request, reply, and event payloads,
/// and the exported types.
pub fn exported() -> BTreeSet<&'static str> {
    macro_rules! names {
        ($($ty:ident),+ $(,)?) => { [$(stringify!($ty)),+] };
    }
    request_contracts()
        .into_values()
        .chain(reply_contracts().into_values())
        .chain(event_contracts().into_values())
        .chain(exported_types!(names))
        .collect()
}

/// The names of the types that the game library exports.
pub fn game_library() -> Vec<&'static str> {
    macro_rules! names {
        ($($ty:ident),+ $(,)?) => { vec![$(stringify!($ty)),+] };
    }
    game_library_types!(names)
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
    let schema = schema_value::<T>();
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

pub fn decode_event(name: &str, value: &Value) -> Result<Option<Value>> {
    macro_rules! dispatch {
        ($($name:ident $command:literal => $payload:ty;)+) => {
            match name {
                $($command => Ok(Some(serde_json::to_value(decode::<$payload>(value)?)?)),)+
                _ => Ok(None),
            }
        };
    }
    event_contracts!(dispatch)
}

/// Validates and decodes the data of a request's reply, or returns None for a request whose reply
/// carries none.
pub fn decode_reply(request: &str, value: &Value) -> Result<Option<Value>> {
    macro_rules! dispatch {
        ($($name:ident $command:literal => $payload:ty $(, reply $reply:ident: $data:ty)?;)+) => {
            match request {
                $($($command => Ok(Some(serde_json::to_value(decode::<$data>(value)?)?)),)?)+
                _ => Ok(None),
            }
        };
    }
    request_contracts!(dispatch)
}

pub fn request_contracts() -> BTreeMap<&'static str, &'static str> {
    macro_rules! names {
        ($($name:ident $command:literal => $payload:ty $(, reply $reply:ident: $data:ty)?;)+) => {
            BTreeMap::from([$(( $command, stringify!($payload) )),+])
        };
    }
    request_contracts!(names)
}

/// The payload type of each reply that carries data, by the name of its request.
pub fn reply_contracts() -> BTreeMap<&'static str, &'static str> {
    macro_rules! names {
        ($($name:ident $command:literal => $payload:ty $(, reply $reply:ident: $data:ty)?;)+) => {{
            let mut names = BTreeMap::new();
            $($(names.insert($command, stringify!($data));)?)+
            names
        }};
    }
    request_contracts!(names)
}

pub fn event_contracts() -> BTreeMap<&'static str, &'static str> {
    macro_rules! names {
        ($($name:ident $command:literal => $payload:ty;)+) => {
            BTreeMap::from([$(( $command, stringify!($payload) )),+])
        };
    }
    event_contracts!(names)
}

/// A registered server event: its name, tied to the payload type the clients validate.
pub struct ServerEvent<T> {
    name: &'static str,
    payload: PhantomData<fn(T)>,
}

impl<T> ServerEvent<T> {
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

impl<T> Clone for ServerEvent<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Copy for ServerEvent<T> {}

macro_rules! event_messages {
    ($($name:ident $command:literal => $payload:ident;)+) => {
        $(pub const $name: super::ServerEvent<crate::$payload> = super::ServerEvent::new($command);)+
    };
}

/// Every event that the server can send. Building a frame requires one of these and its payload type.
pub mod event {
    event_contracts!(event_messages);
}

/// A registered reply that carries data: the name of its request, tied to the payload type the
/// clients validate.
pub struct Reply<T> {
    request: &'static str,
    payload: PhantomData<fn(T)>,
}

impl<T: Serialize> Reply<T> {
    const fn new(request: &'static str) -> Self {
        Self {
            request,
            payload: PhantomData,
        }
    }

    /// The reply's data, ready for the reply to the request that this reply answers.
    pub fn data(&self, data: T) -> ReplyData {
        ReplyData {
            request: self.request,
            data: serde_json::to_value(data).expect("JSON-serializable reply payload"),
        }
    }
}

/// The data of a reply, with the name of the request that it answers.
#[derive(Clone, Debug, PartialEq)]
pub struct ReplyData {
    pub request: &'static str,
    pub data: Value,
}

macro_rules! reply_messages {
    ($($name:ident $command:literal => $payload:ty $(, reply $reply:ident: $data:ty)?;)+) => {
        $($(pub const $reply: super::Reply<$data> = super::Reply::new($command);)?)+
    };
}

/// Every reply that carries data. Building one requires one of these and its payload type.
pub mod reply {
    #[cfg_attr(
        not(test),
        expect(
            clippy::wildcard_imports,
            reason = "the reply table names every payload type"
        )
    )]
    use crate::*;
    request_contracts!(reply_messages);
}

macro_rules! request_enum {
    ($($name:ident $command:literal => $payload:ty $(, reply $reply:ident: $data:ty)?;)+) => {
        /// A client request, decoded once into its payload type. Matching on it, rather than on
        /// request names, lets the compiler check that every request is handled.
        #[derive(Clone, Debug)]
        pub enum ClientRequest {
            $($name($payload),)+
        }

        impl ClientRequest {
            /// Validates and decodes a request, or returns None for an unregistered name.
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

request_contracts!(request_enum);
