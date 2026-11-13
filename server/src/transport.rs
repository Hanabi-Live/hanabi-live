use axum::extract::ws::{CloseFrame, Message};
use hanabi_protocol::UserId;
use serde::Serialize;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
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
pub const GLOBAL_OUTPUT_BYTES: usize = 128 * crate::MIB;
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
            tracing::warn!(user = %session.user, "Closing connection with oversized input.");
            session.cancel.cancel();
            return None;
        }
        let length = u32::try_from(text.len()).unwrap_or(u32::MAX);
        let Ok(local) = self.bytes.clone().try_acquire_many_owned(length) else {
            tracing::warn!(user = %session.user, "Closing connection exceeding its input byte budget.");
            session.cancel.cancel();
            return None;
        };
        let Ok(global) = self.global.clone().try_acquire_many_owned(length) else {
            tracing::warn!(user = %session.user, "Closing connection because the aggregate input byte budget is exhausted.");
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

/// Who a connection signed in as. It does not change while the connection lasts.
#[derive(Clone, Debug)]
pub struct Identity {
    pub user: UserId,
    pub name: String,
    pub normalized_name: String,
    pub ip: String,
    /// Whether the account has authenticated as a bot.
    pub bot: bool,
}

/// A live connection: its user's identity and the queue of frames to send. The hub keeps what can
/// change while the connection lasts, such as the user's status and blocks.
pub struct Session {
    pub identity: Arc<Identity>,
    pub generation: u64,
    /// Cancelled when the connection must stop: it was closed or replaced, the server lost
    /// ownership of the live tables, or the server is shutting down.
    pub cancel: CancellationToken,
    pub lobby_load: Arc<Semaphore>,
    closing: AtomicBool,
    superseded: AtomicBool,
    outbound: mpsc::Sender<Outbound>,
    bytes: Arc<Semaphore>,
    /// The server's output budget, which every session shares.
    global_bytes: Arc<Semaphore>,
}

impl Identity {
    /// The user, with their name.
    pub fn user_ref(&self) -> hanabi_protocol::UserRef {
        hanabi_protocol::UserRef {
            user_id: self.user,
            username: self.name.as_str().into(),
        }
    }
}

impl std::ops::Deref for Session {
    type Target = Identity;
    fn deref(&self) -> &Identity {
        &self.identity
    }
}

impl Session {
    /// A session with no address or server token, for tests.
    #[cfg(test)]
    pub fn new(
        user: UserId,
        name: String,
        generation: u64,
    ) -> (Arc<Self>, mpsc::Receiver<Outbound>) {
        Self::with_token(
            Identity {
                user,
                normalized_name: crate::accounts::normalize_username(&name),
                name,
                ip: String::new(),
                bot: false,
            },
            generation,
            CancellationToken::new(),
            Arc::new(Semaphore::new(GLOBAL_OUTPUT_BYTES)),
        )
    }

    /// Creates a session that stops when `cancel` is cancelled, such as a token from
    /// `Lifecycle::connection_token`. Its frames also count against `global_bytes`, the server's
    /// output budget.
    pub fn with_token(
        identity: Identity,
        generation: u64,
        cancel: CancellationToken,
        global_bytes: Arc<Semaphore>,
    ) -> (Arc<Self>, mpsc::Receiver<Outbound>) {
        let (outbound, receiver) = mpsc::channel(OUTBOUND_QUEUE);
        (
            Arc::new(Self {
                identity: Arc::new(identity),
                generation,
                closing: AtomicBool::new(false),
                superseded: AtomicBool::new(false),
                cancel,
                lobby_load: Arc::new(Semaphore::new(1)),
                outbound,
                bytes: Arc::new(Semaphore::new(SESSION_OUTPUT_BYTES)),
                global_bytes,
            }),
            receiver,
        )
    }

    /// Whether the session can still send and receive. The writer closes a connection whose
    /// session is no longer active.
    pub fn active(&self) -> bool {
        !self.cancel.is_cancelled()
    }

    pub fn supersede(&self) {
        self.superseded.store(true, Ordering::Release);
        self.cancel.cancel();
    }

    pub fn was_superseded(&self) -> bool {
        self.superseded.load(Ordering::Acquire)
    }

    /// Queues a frame. Sending one frame to many sessions shares its bytes rather than copying them.
    pub fn emit(&self, message: &Frame) {
        if !self.active() || self.closing.load(Ordering::Acquire) {
            return;
        }
        self.enqueue(Message::Text(message.clone()), None);
    }

    /// Queues a frame for the writer, holding its bytes against the session's and the server's
    /// output budgets until it is written. A frame that does not fit closes the connection. Returns
    /// whether the frame was queued.
    fn enqueue(&self, message: Message, completion: Option<oneshot::Sender<()>>) -> bool {
        let length = match &message {
            Message::Text(text) => text.len(),
            // A close frame holds one byte, so that it still waits for space in the budgets.
            _ => 1,
        };
        let Some(length) = (length <= MAX_MESSAGE_BYTES)
            .then(|| u32::try_from(length).ok())
            .flatten()
        else {
            tracing::warn!(user = %self.user, "Closing a connection with an oversized frame.");
            self.cancel.cancel();
            return false;
        };
        let Ok(permit) = self.bytes.clone().try_acquire_many_owned(length) else {
            tracing::warn!(user = %self.user, "Closing a slow connection.");
            self.cancel.cancel();
            return false;
        };
        let Ok(global_permit) = self.global_bytes.clone().try_acquire_many_owned(length) else {
            tracing::warn!(user = %self.user,
                "Closing a connection because the aggregate output byte budget is exhausted."
            );
            self.cancel.cancel();
            return false;
        };
        let outbound = Outbound {
            message,
            permit,
            completion,
            global_permit,
        };
        if self.outbound.try_send(outbound).is_err() {
            tracing::warn!(user = %self.user, "Closing a saturated connection.");
            self.cancel.cancel();
            return false;
        }
        true
    }

    /// Sends `messages` and then a close frame with `code`. Nothing else is sent afterward. The
    /// receiver completes once the close frame is written.
    pub fn close_after(&self, messages: &[Frame], code: u16) -> Option<oneshot::Receiver<()>> {
        if !self.active() || self.closing.swap(true, Ordering::AcqRel) {
            return None;
        }
        for message in messages {
            if !self.enqueue(Message::Text(message.clone()), None) {
                return None;
            }
        }
        let (completion, received) = oneshot::channel();
        let close = Message::Close(Some(CloseFrame {
            code,
            reason: "Server maintenance".into(),
        }));
        self.enqueue(close, Some(completion)).then_some(received)
    }
}

/// An encoded WebSocket text frame. Clones share its bytes.
pub type Frame = axum::extract::ws::Utf8Bytes;

/// Encodes a registered server message. Only registered messages with their payload type can be
/// sent, so every frame matches a schema the clients validate.
pub fn frame<T: Serialize>(message: hanabi_protocol::ServerEvent<T>, data: T) -> Frame {
    raw_frame(message.name(), data)
}

/// Encodes a message that the server sends on its own: `{"event": name, "data": payload}`.
fn raw_frame(command: &str, data: impl Serialize) -> Frame {
    encode(&EventFrame {
        event: command,
        data,
    })
}

#[derive(Serialize)]
struct EventFrame<'a, T> {
    event: &'a str,
    data: T,
}

/// The server's answer to a request, which repeats the request's ID: `{"reply": id}`, with the
/// reply's `data` if it has any, or with an `error`.
#[derive(Serialize)]
struct ReplyFrame {
    reply: hanabi_protocol::RequestId,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<hanabi_protocol::Notice>,
}

/// Encodes the reply to a request that succeeded, with its data if it has any.
pub fn reply_frame(
    id: hanabi_protocol::RequestId,
    data: Option<hanabi_protocol::ReplyData>,
) -> Frame {
    encode(&ReplyFrame {
        reply: id,
        data: data.map(|data| data.data),
        error: None,
    })
}

/// Encodes the reply to a request that failed.
pub fn error_frame(id: hanabi_protocol::RequestId, error: hanabi_protocol::Notice) -> Frame {
    encode(&ReplyFrame {
        reply: id,
        data: None,
        error: Some(error),
    })
}

fn encode(frame: &impl Serialize) -> Frame {
    serde_json::to_string(frame)
        .expect("JSON-serializable protocol payload")
        .into()
}

/// Encodes a message as `command JSON`, the frame of clients from before JSON frames, so that a page
/// opened before JSON frames can read that it is outdated and reload. Remove it a month after JSON
/// frames are deployed, when no such page is still open.
pub fn legacy_frame<T: Serialize>(message: hanabi_protocol::ServerEvent<T>, data: &T) -> Frame {
    let mut text = format!("{} ", message.name());
    text.push_str(&serde_json::to_string(data).expect("JSON-serializable protocol payload"));
    text.into()
}

/// The name and payload of an encoded server message, or `None` for a reply.
#[cfg(test)]
pub fn event(frame: &str) -> Option<(String, serde_json::Value)> {
    let serde_json::Value::Object(mut frame) = serde_json::from_str(frame).ok()? else {
        return None;
    };
    let name = frame.remove("event")?.as_str()?.to_owned();
    Some((name, frame.remove("data")?))
}

/// Whether an encoded frame is the server message with this name.
#[cfg(test)]
pub fn is_event(frame: &str, name: &str) -> bool {
    event(frame).is_some_and(|(event, _)| event == name)
}

/// A registered server message waiting to be sent, such as a lobby command's reply, encoded once.
#[derive(Clone, Debug)]
pub struct Outgoing(Frame);

impl Outgoing {
    pub fn new<T: Serialize>(message: hanabi_protocol::ServerEvent<T>, data: T) -> Self {
        Self(frame(message, data))
    }
    #[cfg(test)]
    pub fn command(&self) -> String {
        event(&self.0).expect("an outgoing message is an event").0
    }
    #[cfg(test)]
    pub fn data(&self) -> serde_json::Value {
        event(&self.0).expect("an outgoing message is an event").1
    }
    pub fn frame(&self) -> &Frame {
        &self.0
    }
}

/// Encodes an arbitrary frame, for tests that build expected or invalid messages.
#[cfg(test)]
pub fn test_frame(command: &str, data: impl Serialize) -> Frame {
    raw_frame(command, data)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outbound_saturation_cancels_without_blocking() {
        let (session, _receiver) = Session::new(UserId::new(1).unwrap(), "Alice".into(), 1);
        for _ in 0..65 {
            session.emit(&Frame::from("name {}"));
        }
        assert!(!session.active());
    }
    #[test]
    fn byte_budget_is_released_when_frames_are_dropped() {
        let (session, mut receiver) = Session::new(UserId::new(1).unwrap(), "Alice".into(), 1);
        session.emit(&Frame::from("x".repeat(131_072)));
        drop(receiver.try_recv().unwrap());
        session.emit(&Frame::from("x".repeat(131_072)));
        assert!(session.active());
        session.emit(&Frame::from("x".repeat(MAX_MESSAGE_BYTES + 1)));
        assert!(!session.active());
    }

    #[test]
    fn full_replay_frames_and_ordered_maintenance_close() {
        let (session, mut receiver) = Session::new(UserId::new(1).unwrap(), "Alice".into(), 1);
        session.emit(&Frame::from("x".repeat(300_000)));
        assert!(session.active());
        drop(receiver.try_recv().unwrap());
        let mut completed = session
            .close_after(
                &["serverRestart {}".into(), "error {}".into()],
                SERVICE_RESTART_CLOSE_CODE,
            )
            .unwrap();
        session.emit(&Frame::from("must not follow close"));
        assert_eq!(
            receiver.try_recv().unwrap().message,
            Message::Text("serverRestart {}".into())
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
        let (session, _) = Session::new(UserId::new(1).unwrap(), "Alice".into(), 1);
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
        let (alice, _) = Session::new(UserId::new(1).unwrap(), "Alice".into(), 1);
        let (bob, _) = Session::new(UserId::new(2).unwrap(), "Bob".into(), 2);
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
        let (session, _) = Session::new(UserId::new(1).unwrap(), "Alice".into(), 1);
        let text = format!(
            "replayCreate {}",
            serde_json::json!({"visibility":{"type":"solo"},"source":{"type":"imported","game":{
                "seed":"p2v0s1","notes":[["n".repeat(65536)],[]]
            }}})
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
        let (session, _) = Session::new(UserId::new(1).unwrap(), "Alice".into(), 1);
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
        let (session, mut outgoing) = Session::new(UserId::new(1).unwrap(), "Alice".into(), 1);
        let notes: Vec<_> = (0..6).map(|_| "n".repeat(65536)).collect();
        let all_notes: Vec<_> = (0..6)
            .map(|index| {
                serde_json::json!({
                    "username":format!("Player{index}"),"notes":notes,"spectator":false
                })
            })
            .collect();
        let messages = [
            test_frame(
                "gameState",
                serde_json::json!({
                    "tableId":42,"events":[],"notes":[],"spectators":[],
                    "phase":{"type":"replay","deck":[]},
                }),
            ),
            test_frame(
                "gameState",
                serde_json::json!({
                    "tableId":42,"events":[],"notes":all_notes,"spectators":[],
                    "phase":{"type":"replay","deck":[]},
                }),
            ),
            test_frame(
                "gameState",
                serde_json::json!({
                    "tableId":42,"events":[],"spectators":[],"phase":{"type":"replay","deck":[]},
                    "notes":[{"username":"Player0","notes":notes,"spectator":false}],
                }),
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
            assert_eq!(actual, expected);
        }
        assert_eq!(session.bytes.available_permits(), SESSION_OUTPUT_BYTES);
    }
}
