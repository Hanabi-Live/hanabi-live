use axum::extract::ws::Message;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc};
use tokio_util::sync::CancellationToken;

pub struct Outbound {
    pub message: Message,
    pub permit: OwnedSemaphorePermit,
}

pub struct Session {
    pub user: i32,
    pub name: String,
    pub generation: u64,
    pub hyphenated: bool,
    pub cancel: CancellationToken,
    outbound: mpsc::Sender<Outbound>,
    bytes: Arc<Semaphore>,
}

impl Session {
    pub fn new(
        user: i32,
        name: String,
        generation: u64,
        hyphenated: bool,
    ) -> (Arc<Self>, mpsc::Receiver<Outbound>) {
        let (outbound, receiver) = mpsc::channel(64);
        (
            Arc::new(Self {
                user,
                name,
                generation,
                hyphenated,
                cancel: CancellationToken::new(),
                outbound,
                bytes: Arc::new(Semaphore::new(262_144)),
            }),
            receiver,
        )
    }

    pub fn active(&self) -> bool {
        !self.cancel.is_cancelled()
    }

    pub fn emit(&self, message: &str) {
        if !self.active() {
            return;
        }
        let permit = u32::try_from(message.len())
            .ok()
            .and_then(|len| self.bytes.clone().try_acquire_many_owned(len).ok());
        let Some(permit) = permit else {
            eprintln!("Closing a slow or oversized PoC connection.");
            self.cancel.cancel();
            return;
        };
        let outbound = Outbound {
            message: Message::Text(message.to_owned().into()),
            permit,
        };
        if self.outbound.try_send(outbound).is_err() {
            eprintln!("Closing a saturated PoC connection.");
            self.cancel.cancel();
        }
    }
}

pub fn frame(command: &str, data: Value) -> String {
    format!("{command} {data}")
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
        session.emit(&"x".repeat(262_144));
        assert!(!session.active());
    }
}
