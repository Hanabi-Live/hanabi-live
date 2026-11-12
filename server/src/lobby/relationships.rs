use super::{Effect, Publication, notice, refused};
use crate::accounts::{escape_html, normalize_string};
use crate::transport::{Identity, Outgoing};
use anyhow::Result;
use hanabi_protocol::{UserId, Username};
use sqlx::PgPool;

pub async fn friends(pool: &PgPool, id: UserId) -> Result<Vec<Username>> {
    Ok(sqlx::query_scalar!(
        "SELECT u.username FROM user_friends f JOIN users u ON u.id=f.friend_id
         WHERE f.user_id=$1 ORDER BY LOWER(u.username) COLLATE \"C\"",
        id.get()
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(Username::from)
    .collect())
}

/// The users whom `id` has blocked.
pub async fn blocked(pool: &PgPool, id: UserId) -> Result<Vec<Username>> {
    Ok(sqlx::query_scalar!(
        "SELECT u.username FROM user_blocks b JOIN users u ON u.id=b.blocked_id
         WHERE b.user_id=$1 ORDER BY LOWER(u.username) COLLATE \"C\"",
        id.get()
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(Username::from)
    .collect())
}

/// Whether `user` and any of `others` have blocked each other, in either direction.
pub async fn blocked_between(pool: &PgPool, user: UserId, others: &[UserId]) -> Result<bool> {
    if others.is_empty() {
        return Ok(false);
    }
    let others = others.iter().map(|other| other.get()).collect::<Vec<_>>();
    Ok(sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM user_blocks
         WHERE (user_id=$1 AND blocked_id=ANY($2)) OR (blocked_id=$1 AND user_id=ANY($2))) AS \"value!\"",
        user.get(),
        &others
    )
    .fetch_one(pool)
    .await?)
}

/// Everyone who has blocked, or was blocked by, `id`.
pub async fn block_relations(pool: &PgPool, id: UserId) -> Result<Vec<UserId>> {
    sqlx::query_scalar!(
        "SELECT blocked_id AS \"id!\" FROM user_blocks WHERE user_id=$1
         UNION SELECT user_id FROM user_blocks WHERE blocked_id=$1",
        id.get()
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|id| Ok(UserId::try_from(id)?))
    .collect()
}

pub async fn change_friend(pool: &PgPool, id: UserId, target: UserId, add: bool) -> Result<bool> {
    let (id, target) = (id.get(), target.get());
    let mut tx = pool.begin().await?;
    sqlx::query!("SELECT id FROM users WHERE id=$1 FOR UPDATE", id)
        .fetch_one(&mut *tx)
        .await?;
    let exists: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM user_friends WHERE user_id=$1 AND friend_id=$2) AS \"value!\"",
        id,
        target
    )
    .fetch_one(&mut *tx)
    .await?;
    if exists == add {
        return Ok(false);
    }
    if add {
        sqlx::query!(
            "INSERT INTO user_friends(user_id,friend_id) VALUES($1,$2)",
            id,
            target
        )
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query!(
            "DELETE FROM user_friends WHERE user_id=$1 AND friend_id=$2",
            id,
            target
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(true)
}

/// A change to who the caller has as a friend, a linked account, or a blocked user. Each is also a
/// chat command, which the messages name.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Friend,
    Unfriend,
    Link,
    Unlink,
    Block,
    Unblock,
}

impl Change {
    /// The chat command that makes the change.
    const fn verb(self) -> &'static str {
        match self {
            Self::Friend => "friend",
            Self::Unfriend => "unfriend",
            Self::Link => "link",
            Self::Unlink => "unlink",
            Self::Block => "block",
            Self::Unblock => "unblock",
        }
    }
}

/// Tells the caller which accounts they have linked.
pub async fn linked_list(pool: &PgPool, caller: &Identity) -> Result<Vec<Effect>> {
    let names: Vec<String> = sqlx::query_scalar!(
        "SELECT u.username FROM user_linkages l JOIN users u ON u.id=l.linked_id
             WHERE l.user_id=$1 ORDER BY LOWER(u.username) COLLATE \"C\"",
        caller.user.get()
    )
    .fetch_all(pool)
    .await?;
    let message = if names.is_empty() {
        "Currently, you do not have any linked accounts.".into()
    } else {
        format!(
            "Currently linked accounts: {}",
            names
                .iter()
                .map(|n| escape_html(n))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    Ok(vec![notice(&caller.name, &message)])
}

pub async fn relationship(
    pool: &PgPool,
    caller: &Identity,
    change: Change,
    name: &str,
) -> Result<Vec<Effect>> {
    let verb = change.verb();
    let normalized = normalize_string(name);
    if name.is_empty() {
        return refused(format!(
            "The format of the /{verb} command is: /{verb} [username]"
        ));
    }
    if normalized == caller.normalized_name {
        return refused(format!("You cannot {verb} yourself."));
    }
    let target: Option<i32> = sqlx::query_scalar!(
        "SELECT id FROM users WHERE normalized_username=$1",
        normalized
    )
    .fetch_optional(pool)
    .await?;
    let Some(target) = target.map(UserId::try_from).transpose()? else {
        return refused(format!(
            "The username of \"{name}\" does not exist in the database."
        ));
    };
    let escaped = escape_html(name);
    if matches!(change, Change::Block | Change::Unblock) {
        return block(pool, caller, target, name, change == Change::Block).await;
    }
    let add = matches!(change, Change::Friend | Change::Link);
    let friend = matches!(change, Change::Friend | Change::Unfriend);
    let changed = if friend {
        change_friend(pool, caller.user, target, add).await?
    } else {
        let result = if add {
            sqlx::query!(
                "INSERT INTO user_linkages(user_id,linked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
                caller.user.get(),
                target.get()
            )
            .execute(pool)
            .await?
        } else {
            sqlx::query!(
                "DELETE FROM user_linkages WHERE user_id=$1 AND linked_id=$2",
                caller.user.get(),
                target.get()
            )
            .execute(pool)
            .await?
        };
        result.rows_affected() != 0
    };
    if !changed {
        return refused(match (friend, add) {
            (true, true) => format!("\"{name}\" is already your friend."),
            (true, false) => format!("\"{name}\" is not your friend, so you cannot unfriend them."),
            (false, true) => format!("\"{name}\" is already linked to your account."),
            (false, false) => {
                format!("\"{name}\" is not linked to your account, so you cannot unlink them.")
            }
        });
    }
    let message = format!(
        "Successfully {} \"{escaped}\" {} your {}.",
        if add { "added" } else { "removed" },
        if add { "to" } else { "from" },
        if friend {
            "friends list"
        } else {
            "linked users"
        }
    );
    let mut effects = vec![notice(&caller.name, &message)];
    if friend {
        effects.push(Effect::to_self(Outgoing::new(
            hanabi_protocol::server::FRIENDS,
            hanabi_protocol::Friends {
                friends: friends(pool, caller.user).await?,
            },
        )));
    }
    Ok(effects)
}

async fn block(
    pool: &PgPool,
    caller: &Identity,
    target: UserId,
    name: &str,
    add: bool,
) -> Result<Vec<Effect>> {
    let result = if add {
        sqlx::query!(
            "INSERT INTO user_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            caller.user.get(),
            target.get()
        )
        .execute(pool)
        .await?
    } else {
        sqlx::query!(
            "DELETE FROM user_blocks WHERE user_id=$1 AND blocked_id=$2",
            caller.user.get(),
            target.get()
        )
        .execute(pool)
        .await?
    };
    if result.rows_affected() == 0 {
        return refused(if add {
            format!("\"{name}\" is already blocked.")
        } else {
            format!("\"{name}\" is not blocked, so you cannot unblock them.")
        });
    }
    let escaped = escape_html(name);
    let message = if add {
        format!(
            "Successfully blocked \"{escaped}\". You can no longer join or spectate each other's tables or send each other private messages."
        )
    } else {
        format!("Successfully unblocked \"{escaped}\".")
    };
    Ok(vec![
        notice(&caller.name, &message),
        Effect::to_self(Outgoing::new(
            hanabi_protocol::server::BLOCKED,
            hanabi_protocol::Blocked {
                blocked: blocked(pool, caller.user).await?,
            },
        )),
        Publication::BlocksChanged {
            user_id: caller.user,
            target_id: target,
            // The other user may have blocked this one too.
            blocked: blocked_between(pool, caller.user, &[target]).await?,
        }
        .into(),
    ])
}
