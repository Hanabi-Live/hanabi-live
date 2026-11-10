//! Slow work that a table starts and finishes later, such as a database read or a password check.
//! The table keeps answering other commands while it waits.

use super::{Blocks, Reply, chat::VariantDiscovery};
use crate::transport::Session;
use anyhow::Result;
use futures_util::{StreamExt, future::BoxFuture, stream::FuturesUnordered};
use hanabi_protocol::{PregameStats, UserId};
use std::{
    collections::{BTreeMap, HashMap},
    sync::Arc,
};

/// Work that has finished, which the table now applies.
pub(super) enum Completed {
    /// The game totals of a recovered pregame's players.
    GameCounts(Result<(Vec<UserId>, BTreeMap<UserId, i64>)>),
    /// A search for a variant that the participants still need to max.
    Discovery {
        discovery: VariantDiscovery,
        selected: Result<Option<String>>,
    },
    /// The statistics of a shared replay's restart: saved for its finished game, then read for
    /// its original players.
    Restart {
        session: Arc<Session>,
        hide: bool,
        stats: Result<BTreeMap<UserId, PregameStats>>,
    },
    /// The password check of a join.
    Password {
        session: Arc<Session>,
        blocks: Blocks,
        /// The table password hash that the password was checked against.
        hash: String,
        valid: Result<bool>,
    },
}

/// A table's unfinished work, and the replies of the commands that wait for it.
#[derive(Default)]
pub(super) struct Pending {
    work: FuturesUnordered<BoxFuture<'static, (u64, Completed)>>,
    replies: HashMap<u64, Reply>,
    next_id: u64,
}

impl Pending {
    /// Starts `work`. When it finishes, `next` returns it with `reply`.
    pub(super) fn start(
        &mut self,
        work: impl Future<Output = Completed> + Send + 'static,
        reply: Option<Reply>,
    ) {
        let id = self.next_id;
        self.next_id += 1;
        if let Some(reply) = reply {
            self.replies.insert(id, reply);
        }
        self.work.push(Box::pin(async move { (id, work.await) }));
    }

    /// The next work to finish, and the reply that waits for it. Never finishes while nothing is
    /// pending. Cancelling it loses no work.
    pub(super) async fn next(&mut self) -> (Completed, Option<Reply>) {
        match self.work.next().await {
            Some((id, completed)) => (completed, self.replies.remove(&id)),
            None => std::future::pending().await,
        }
    }

    /// Drops the unfinished work and refuses the commands that wait for it.
    pub(super) fn close(self) {
        for reply in self.replies.into_values() {
            let _ = reply.send(Err(rejection!(
                "The table closed before this command finished."
            )));
        }
    }
}
