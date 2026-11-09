use axum::extract::ws::{CloseFrame, Message};
use serde::Serialize;
use std::sync::{
    Arc, LazyLock,
    atomic::{AtomicBool, AtomicU8, Ordering},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc, oneshot};
use tokio_util::sync::CancellationToken;

pub struct Outbound {
    pub message: Message,
    pub permit: OwnedSemaphorePermit,
    pub completion: Option<oneshot::Sender<()>>,
    pub global_permit: OwnedSemaphorePermit,
}

/// Full JSON replays share the durable state ceiling, rather than an 8 KiB
/// text-chat limit. Separate byte budgets bound aggregate queued memory.
pub const MAX_MESSAGE_BYTES: usize = crate::state::MAX_CHECKPOINT_BYTES;
pub const GLOBAL_INPUT_BYTES: usize = 64 * crate::MIB;
const SESSION_INPUT_BYTES: usize = 8 * crate::MIB;
const SESSION_OUTPUT_BYTES: usize = 8 * crate::MIB;
const GLOBAL_OUTPUT_LIMIT: usize = 128 * crate::MIB;
static GLOBAL_OUTPUT_BYTES: LazyLock<Arc<Semaphore>> =
    LazyLock::new(|| Arc::new(Semaphore::new(GLOBAL_OUTPUT_LIMIT)));
/// The frames a session queues for its writer.
const OUTBOUND_QUEUE: usize = 64;
/// The WebSocket close code for "Service Restart", which tells clients to reconnect.
pub const SERVICE_RESTART_CLOSE_CODE: u16 = 1012;

pub struct Inbound {
    pub text: String,
    _session_bytes: OwnedSemaphorePermit,
    _global_bytes: OwnedSemaphorePermit,
}

pub struct InboundBudget {
    bytes: Arc<Semaphore>,
    global: Arc<Semaphore>,
}

impl InboundBudget {
    pub fn new(global: Arc<Semaphore>) -> Self {
        Self {
            bytes: Arc::new(Semaphore::new(SESSION_INPUT_BYTES)),
            global,
        }
    }

    pub fn admit(&self, session: &Session, text: &str) -> Option<Inbound> {
        if !session.active() {
            return None;
        }
        if text.len() > MAX_MESSAGE_BYTES {
            eprintln!("Closing connection with oversized input.");
            session.cancel.cancel();
            return None;
        }
        let length = u32::try_from(text.len()).unwrap_or(u32::MAX);
        let Ok(local) = self.bytes.clone().try_acquire_many_owned(length) else {
            eprintln!("Closing connection exceeding its input byte budget.");
            session.cancel.cancel();
            return None;
        };
        let Ok(global) = self.global.clone().try_acquire_many_owned(length) else {
            eprintln!("Closing connection because the aggregate input byte budget is exhausted.");
            session.cancel.cancel();
            return None;
        };
        // Reserve before copying the transport frame. Both permits travel with
        // the queued/processing message and cannot be cloned with its contents.
        Some(Inbound {
            text: text.to_owned(),
            _session_bytes: local,
            _global_bytes: global,
        })
    }
}

pub struct Session {
    pub user: i32,
    pub name: String,
    pub generation: u64,
    pub normalized_name: String,
    pub ip: String,
    pub cancel: CancellationToken,
    pub ownership_lost: CancellationToken,
    pub lobby_load: Arc<Semaphore>,
    health: HealthCheck,
    /// Whether the account has authenticated as a bot.
    pub bot: bool,
    h_group: AtomicBool,
    h_group_level: AtomicU8,
    /// Users who have blocked, or were blocked by, this user.
    blocks: std::sync::Mutex<std::collections::BTreeSet<i32>>,
    inactive: AtomicBool,
    closing: AtomicBool,
    superseded: AtomicBool,
    outbound: mpsc::Sender<Outbound>,
    bytes: Arc<Semaphore>,
}

pub type HealthCheck = Arc<dyn Fn() -> bool + Send + Sync>;

pub struct SessionMetadata {
    pub user: i32,
    pub name: String,
    pub normalized_name: String,
    pub ip: String,
    pub generation: u64,
    pub h_group: bool,
    pub h_group_level: u8,
    pub bot: bool,
}

impl Session {
    pub fn new(
        user: i32,
        name: String,
        generation: u64,
        h_group: bool,
    ) -> (Arc<Self>, mpsc::Receiver<Outbound>) {
        Self::with_health(
            SessionMetadata {
                user,
                normalized_name: crate::accounts::normalize_username(&name),
                name,
                ip: String::new(),
                generation,
                h_group,
                h_group_level: 0,
                bot: false,
            },
            CancellationToken::new(),
            Arc::new(|| true),
        )
    }

    pub fn with_health(
        metadata: SessionMetadata,
        ownership_lost: CancellationToken,
        health: HealthCheck,
    ) -> (Arc<Self>, mpsc::Receiver<Outbound>) {
        let (outbound, receiver) = mpsc::channel(OUTBOUND_QUEUE);
        (
            Arc::new(Self {
                user: metadata.user,
                name: metadata.name,
                normalized_name: metadata.normalized_name,
                ip: metadata.ip,
                generation: metadata.generation,
                bot: metadata.bot,
                h_group: AtomicBool::new(metadata.h_group),
                h_group_level: AtomicU8::new(metadata.h_group_level),
                blocks: std::sync::Mutex::default(),
                inactive: AtomicBool::new(false),
                closing: AtomicBool::new(false),
                superseded: AtomicBool::new(false),
                cancel: CancellationToken::new(),
                ownership_lost,
                lobby_load: Arc::new(Semaphore::new(1)),
                health,
                outbound,
                bytes: Arc::new(Semaphore::new(SESSION_OUTPUT_BYTES)),
            }),
            receiver,
        )
    }

    pub fn active(&self) -> bool {
        if self.cancel.is_cancelled() || self.ownership_lost.is_cancelled() || !(self.health)() {
            self.cancel.cancel();
            return false;
        }
        true
    }

    pub fn supersede(&self) {
        self.superseded.store(true, Ordering::Release);
        self.cancel.cancel();
    }

    pub fn was_superseded(&self) -> bool {
        self.superseded.load(Ordering::Acquire)
    }

    pub fn h_group(&self) -> bool {
        self.h_group.load(Ordering::Acquire)
    }

    /// Whether this user has blocked, or was blocked by, any of `users`.
    pub fn blocks_any(&self, users: impl IntoIterator<Item = i32>) -> bool {
        let blocks = self
            .blocks
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        users.into_iter().any(|user| blocks.contains(&user))
    }

    /// Records whether any block remains between this user and `other`.
    pub fn set_blocked(&self, other: i32, blocked: bool) {
        let mut blocks = self
            .blocks
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if blocked {
            blocks.insert(other);
        } else {
            blocks.remove(&other);
        }
    }

    pub fn set_h_group(&self, value: bool) {
        self.h_group.store(value, Ordering::Release);
    }

    pub fn h_group_level(&self) -> u8 {
        self.h_group_level.load(Ordering::Acquire)
    }

    pub fn set_h_group_level(&self, value: u8) {
        self.h_group_level.store(value, Ordering::Release);
    }

    pub fn inactive(&self) -> bool {
        self.inactive.load(Ordering::Acquire)
    }

    pub fn set_inactive(&self, value: bool) {
        self.inactive.store(value, Ordering::Release);
    }

    pub fn emit(&self, message: &str) {
        if !self.active() || self.closing.load(Ordering::Acquire) {
            return;
        }
        let permit = (message.len() <= MAX_MESSAGE_BYTES)
            .then_some(message.len())
            .and_then(|len| u32::try_from(len).ok())
            .and_then(|len| self.bytes.clone().try_acquire_many_owned(len).ok());
        let Some(permit) = permit else {
            eprintln!("Closing a slow or oversized connection.");
            self.cancel.cancel();
            return;
        };
        let Ok(global_permit) = GLOBAL_OUTPUT_BYTES
            .clone()
            .try_acquire_many_owned(u32::try_from(message.len()).unwrap_or(u32::MAX))
        else {
            self.cancel.cancel();
            return;
        };
        let outbound = Outbound {
            message: Message::Text(message.to_owned().into()),
            permit,
            completion: None,
            global_permit,
        };
        if self.outbound.try_send(outbound).is_err() {
            eprintln!("Closing a saturated connection.");
            self.cancel.cancel();
        }
    }

    pub fn close_after(&self, messages: &[String], code: u16) -> Option<oneshot::Receiver<()>> {
        if !self.active() || self.closing.swap(true, Ordering::AcqRel) {
            return None;
        }
        for message in messages {
            let permit = (message.len() <= MAX_MESSAGE_BYTES)
                .then_some(message.len())
                .and_then(|len| u32::try_from(len).ok())
                .and_then(|len| self.bytes.clone().try_acquire_many_owned(len).ok());
            let Some(permit) = permit else {
                self.cancel.cancel();
                return None;
            };
            let Ok(global_permit) = GLOBAL_OUTPUT_BYTES
                .clone()
                .try_acquire_many_owned(u32::try_from(message.len()).unwrap_or(u32::MAX))
            else {
                self.cancel.cancel();
                return None;
            };
            if self
                .outbound
                .try_send(Outbound {
                    message: Message::Text(message.clone().into()),
                    permit,
                    completion: None,
                    global_permit,
                })
                .is_err()
            {
                self.cancel.cancel();
                return None;
            }
        }
        let Ok(permit) = self.bytes.clone().try_acquire_owned() else {
            self.cancel.cancel();
            return None;
        };
        let (completion, received) = oneshot::channel();
        let Ok(global_permit) = GLOBAL_OUTPUT_BYTES.clone().try_acquire_owned() else {
            self.cancel.cancel();
            return None;
        };
        if self
            .outbound
            .try_send(Outbound {
                message: Message::Close(Some(CloseFrame {
                    code,
                    reason: "Server maintenance".into(),
                })),
                permit,
                completion: Some(completion),
                global_permit,
            })
            .is_err()
        {
            self.cancel.cancel();
            return None;
        }
        Some(received)
    }
}

/// Encodes a registered server message. Only registered messages with their payload type can be
/// sent, so every frame matches a schema the clients validate.
pub fn frame<T: Serialize>(message: hanabi_protocol::ServerMessage<T>, data: T) -> String {
    raw_frame(message.name(), data)
}

fn raw_frame(command: &str, data: impl Serialize) -> String {
    let mut buffer = command.as_bytes().to_vec();
    buffer.push(b' ');
    serde_json::to_writer(&mut buffer, &data).expect("JSON-serializable protocol payload");
    String::from_utf8(buffer).expect("JSON protocol frames are UTF-8")
}

/// Encodes JSON stored before payloads were typed, such as chat saved in a table checkpoint. It is
/// checked against the message's schema first, so it cannot reach clients in another shape.
pub fn stored_frame<T: hanabi_protocol::JsonSchema>(
    message: hanabi_protocol::ServerMessage<T>,
    data: &serde_json::Value,
) -> anyhow::Result<String> {
    hanabi_protocol::validate::<T>(data)?;
    Ok(raw_frame(message.name(), data))
}

/// A registered server message waiting to be sent, such as a lobby command's reply.
#[derive(Clone, Debug)]
pub struct Outgoing {
    command: &'static str,
    data: serde_json::Value,
}

impl Outgoing {
    pub fn new<T: Serialize>(message: hanabi_protocol::ServerMessage<T>, data: T) -> Self {
        Self {
            command: message.name(),
            data: serde_json::to_value(data).expect("JSON-serializable protocol payload"),
        }
    }
    pub fn command(&self) -> &'static str {
        self.command
    }
    pub fn data(&self) -> &serde_json::Value {
        &self.data
    }
    pub fn frame(&self) -> String {
        raw_frame(self.command, &self.data)
    }
}

/// Encodes an arbitrary frame, for tests that build expected or invalid messages.
#[cfg(test)]
pub fn test_frame(command: &str, data: impl Serialize) -> String {
    raw_frame(command, data)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outbound_saturation_cancels_without_blocking() {
        let (session, _receiver) = Session::new(1, "Alice".into(), 1, false);
        for _ in 0..65 {
            session.emit("name {}");
        }
        assert!(!session.active());
    }
    #[test]
    fn byte_budget_is_released_when_frames_are_dropped() {
        let (session, mut receiver) = Session::new(1, "Alice".into(), 1, false);
        session.emit(&"x".repeat(131_072));
        drop(receiver.try_recv().unwrap());
        session.emit(&"x".repeat(131_072));
        assert!(session.active());
        session.emit(&"x".repeat(MAX_MESSAGE_BYTES + 1));
        assert!(!session.active());
    }

    #[test]
    fn a_failed_ownership_check_stops_a_session_before_the_watchdog_notices() {
        let valid = Arc::new(AtomicBool::new(true));
        let check = valid.clone();
        let lost = CancellationToken::new();
        let (session, mut receiver) = Session::with_health(
            SessionMetadata {
                user: 1,
                name: "Alice".into(),
                normalized_name: "alice".into(),
                ip: "127.0.0.1".into(),
                generation: 1,
                h_group: false,
                h_group_level: 0,
                bot: false,
            },
            lost.clone(),
            Arc::new(move || check.load(Ordering::Acquire)),
        );
        session.emit("before {}");
        drop(receiver.try_recv().unwrap());
        valid.store(false, Ordering::Release);
        assert!(!lost.is_cancelled());
        session.emit("after {}");
        assert!(!session.active());
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn full_replay_frames_and_ordered_maintenance_close() {
        let (session, mut receiver) = Session::new(1, "Alice".into(), 1, false);
        session.emit(&"x".repeat(300_000));
        assert!(session.active());
        drop(receiver.try_recv().unwrap());
        let mut completed = session
            .close_after(
                &["soundLobby {}".into(), "error {}".into()],
                SERVICE_RESTART_CLOSE_CODE,
            )
            .unwrap();
        session.emit("must not follow close");
        assert_eq!(
            receiver.try_recv().unwrap().message,
            Message::Text("soundLobby {}".into())
        );
        assert_eq!(
            receiver.try_recv().unwrap().message,
            Message::Text("error {}".into())
        );
        let close = receiver.try_recv().unwrap();
        assert!(matches!(
            close.message,
            Message::Close(Some(CloseFrame { code, .. })) if code == SERVICE_RESTART_CLOSE_CODE
        ));
        close.completion.unwrap().send(()).unwrap();
        assert!(completed.try_recv().is_ok());
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn inbound_processing_and_queued_frames_share_the_session_budget() {
        let global = Arc::new(Semaphore::new(24));
        let budget = InboundBudget {
            bytes: Arc::new(Semaphore::new(16)),
            global: global.clone(),
        };
        let (session, _) = Session::new(1, "Alice".into(), 1, false);
        let (sender, mut receiver) = mpsc::channel(1);
        assert!(
            sender
                .try_send(budget.admit(&session, "12345678").unwrap())
                .is_ok()
        );
        let processing = receiver.try_recv().unwrap();
        assert!(
            sender
                .try_send(budget.admit(&session, "abcdefgh").unwrap())
                .is_ok()
        );
        assert!(budget.admit(&session, "!").is_none());
        assert!(session.cancel.is_cancelled());
        assert_eq!(global.available_permits(), 8);
        drop(processing);
        assert_eq!(global.available_permits(), 16);
        drop(receiver);
        assert_eq!(global.available_permits(), 24);
        assert_eq!(budget.bytes.available_permits(), 16);
    }

    #[test]
    fn inbound_global_saturation_and_queue_rejection_release_both_permits() {
        let global = Arc::new(Semaphore::new(12));
        let first = InboundBudget {
            bytes: Arc::new(Semaphore::new(16)),
            global: global.clone(),
        };
        let second = InboundBudget {
            bytes: Arc::new(Semaphore::new(16)),
            global: global.clone(),
        };
        let (alice, _) = Session::new(1, "Alice".into(), 1, false);
        let (bob, _) = Session::new(2, "Bob".into(), 2, false);
        let processing = first.admit(&alice, "12345678").unwrap();
        assert!(second.admit(&bob, "abcdefgh").is_none());
        assert!(bob.cancel.is_cancelled());
        assert!(alice.active());
        assert_eq!(second.bytes.available_permits(), 16);
        drop(processing);
        assert_eq!(global.available_permits(), 12);
        let (sender, receiver) = mpsc::channel(1);
        assert!(
            sender
                .try_send(first.admit(&alice, "12345678").unwrap())
                .is_ok()
        );
        assert!(
            sender
                .try_send(first.admit(&alice, "abcd").unwrap())
                .is_err()
        );
        assert_eq!(global.available_permits(), 4);
        assert_eq!(first.bytes.available_permits(), 8);
        drop(receiver);
        assert_eq!(global.available_permits(), 12);
        assert_eq!(first.bytes.available_permits(), 16);
    }

    #[test]
    fn inbound_valid_large_replay_keeps_full_payload_and_returns_capacity() {
        let global = Arc::new(Semaphore::new(GLOBAL_INPUT_BYTES));
        let budget = InboundBudget::new(global.clone());
        let (session, _) = Session::new(1, "Alice".into(), 1, false);
        let text = format!(
            "replayCreate {}",
            serde_json::json!({"source":"json","visibility":"solo","gameJSON":{
                "seed":"p2v0s1","notes":[["n".repeat(65536)],[]]
            }})
        );
        let message = budget.admit(&session, &text).unwrap();
        assert_eq!(message.text, text);
        assert!(session.active());
        assert_eq!(global.available_permits(), GLOBAL_INPUT_BYTES - text.len());
        drop(message);
        assert_eq!(global.available_permits(), GLOBAL_INPUT_BYTES);
    }

    #[tokio::test]
    async fn cancelled_inbound_processing_releases_owned_byte_permits() {
        let global = Arc::new(Semaphore::new(24));
        let budget = InboundBudget {
            bytes: Arc::new(Semaphore::new(16)),
            global: global.clone(),
        };
        let (session, _) = Session::new(1, "Alice".into(), 1, false);
        let message = budget.admit(&session, "12345678").unwrap();
        let task = tokio::spawn(async move {
            std::future::pending::<()>().await;
            drop(message);
        });
        assert_eq!(global.available_permits(), 16);
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_eq!(global.available_permits(), 24);
        assert_eq!(budget.bytes.available_permits(), 16);
    }

    #[test]
    fn valid_large_replay_notes_queue_without_a_writer_and_remain_complete() {
        let (session, mut outgoing) = Session::new(1, "Alice".into(), 1, false);
        let notes: Vec<_> = (0..6).map(|_| "n".repeat(65536)).collect();
        let all_notes: Vec<_> = (0..6)
            .map(|index| {
                serde_json::json!({
                    "name":format!("Player{index}"),"notes":notes,"isSpectator":false
                })
            })
            .collect();
        let messages = [
            test_frame(
                "gameActionList",
                serde_json::json!({"tableID":42,"list":[]}),
            ),
            test_frame(
                "noteList",
                serde_json::json!({"tableID":42,"notes":all_notes}),
            ),
            test_frame(
                "noteListPlayer",
                serde_json::json!({"tableID":42,"notes":notes}),
            ),
        ];
        assert!(messages[1].len() > 262_144);
        assert!(
            messages
                .iter()
                .all(|message| message.len() <= MAX_MESSAGE_BYTES)
        );
        for message in &messages {
            session.emit(message);
        }
        assert!(
            session.active(),
            "Valid replay projection required the writer to race publication"
        );
        for expected in messages {
            let outbound = outgoing.try_recv().unwrap();
            let Message::Text(actual) = outbound.message else {
                panic!("Unexpected replay frame");
            };
            assert_eq!(actual.as_str(), expected);
        }
        assert_eq!(session.bytes.available_permits(), SESSION_OUTPUT_BYTES);
    }
}
