use super::{Effect, Publication, notice, warning};
use crate::accounts::{escape_html, normalize_string};
use crate::transport::{Identity, Outgoing};
use anyhow::Result;
use hanabi_protocol::UserId;
use sqlx::PgPool;

pub async fn friends(pool: &PgPool, id: i32) -> Result<Vec<String>> {
    Ok(sqlx::query_scalar!(
        "SELECT u.username FROM user_friends f JOIN users u ON u.id=f.friend_id
         WHERE f.user_id=$1 ORDER BY LOWER(u.username) COLLATE \"C\"",
        id
    )
    .fetch_all(pool)
    .await?)
}

/// Whether `user` and any of `others` have blocked each other, in either direction.
pub async fn blocked_between(pool: &PgPool, user: i32, others: &[i32]) -> Result<bool> {
    if others.is_empty() {
        return Ok(false);
    }
    Ok(sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM user_blocks
         WHERE (user_id=$1 AND blocked_id=ANY($2)) OR (blocked_id=$1 AND user_id=ANY($2))) AS \"value!\"",
        user,
        others
    )
    .fetch_one(pool)
    .await?)
}

/// Everyone who has blocked, or was blocked by, `id`.
pub async fn block_relations(pool: &PgPool, id: i32) -> Result<Vec<i32>> {
    Ok(sqlx::query_scalar!(
        "SELECT blocked_id AS \"id!\" FROM user_blocks WHERE user_id=$1
         UNION SELECT user_id FROM user_blocks WHERE blocked_id=$1",
        id
    )
    .fetch_all(pool)
    .await?)
}

pub async fn change_friend(pool: &PgPool, id: i32, target: i32, add: bool) -> Result<bool> {
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

pub async fn relationship(
    pool: &PgPool,
    caller: &Identity,
    command: &str,
    name: &str,
    room: &str,
) -> Result<Vec<Effect>> {
    if command == "chatBlocked" {
        let names: Vec<String> = sqlx::query_scalar!(
            "SELECT u.username FROM user_blocks b JOIN users u ON u.id=b.blocked_id
             WHERE b.user_id=$1 ORDER BY LOWER(u.username) COLLATE \"C\"",
            caller.user.0
        )
        .fetch_all(pool)
        .await?;
        let message = if names.is_empty() {
            "Currently, you have not blocked anyone.".into()
        } else {
            format!(
                "Currently blocked players: {}",
                names
                    .iter()
                    .map(|n| escape_html(n))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        };
        return Ok(vec![notice(&caller.name, &message, room)]);
    }
    if command == "chatLinked" {
        let names: Vec<String> = sqlx::query_scalar!(
            "SELECT u.username FROM user_linkages l JOIN users u ON u.id=l.linked_id
             WHERE l.user_id=$1 ORDER BY LOWER(u.username) COLLATE \"C\"",
            caller.user.0
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
        return Ok(vec![notice(&caller.name, &message, room)]);
    }
    let verb = match command {
        "chatFriend" => "friend",
        "chatUnfriend" => "unfriend",
        "chatLink" => "link",
        "chatUnlink" => "unlink",
        "chatBlock" => "block",
        _ => "unblock",
    };
    let normalized = normalize_string(name);
    if name.is_empty() {
        return Ok(vec![warning(&format!(
            "The format of the /{verb} command is: /{verb} [username]"
        ))]);
    }
    if normalized == caller.normalized_name {
        return Ok(vec![warning(&format!("You cannot {verb} yourself."))]);
    }
    let target: Option<i32> = sqlx::query_scalar!(
        "SELECT id FROM users WHERE normalized_username=$1",
        normalized
    )
    .fetch_optional(pool)
    .await?;
    let Some(target) = target else {
        return Ok(vec![warning(&format!(
            "The username of \"{}\" does not exist in the database.",
            escape_html(name)
        ))]);
    };
    let escaped = escape_html(name);
    if matches!(verb, "block" | "unblock") {
        return block(pool, caller, target, &escaped, verb == "block", room).await;
    }
    let add = matches!(verb, "friend" | "link");
    let friend = matches!(verb, "friend" | "unfriend");
    let changed = if friend {
        change_friend(pool, caller.user.0, target, add).await?
    } else {
        let result = if add {
            sqlx::query!(
                "INSERT INTO user_linkages(user_id,linked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
                caller.user.0,
                target
            )
            .execute(pool)
            .await?
        } else {
            sqlx::query!(
                "DELETE FROM user_linkages WHERE user_id=$1 AND linked_id=$2",
                caller.user.0,
                target
            )
            .execute(pool)
            .await?
        };
        result.rows_affected() != 0
    };
    if !changed {
        let message = match (friend, add) {
            (true, true) => format!("\"{escaped}\" is already your friend."),
            (true, false) => {
                format!("\"{escaped}\" is not your friend, so you cannot unfriend them.")
            }
            (false, true) => format!("\"{escaped}\" is already linked to your account."),
            (false, false) => {
                format!("\"{escaped}\" is not linked to your account, so you cannot unlink them.")
            }
        };
        return Ok(vec![warning(&message)]);
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
    let mut effects = vec![notice(&caller.name, &message, room)];
    if friend {
        effects.push(Effect::to_self(Outgoing::new(
            hanabi_protocol::server::FRIENDS,
            hanabi_protocol::Friends {
                friends: friends(pool, caller.user.0).await?,
            },
        )));
    }
    Ok(effects)
}

async fn block(
    pool: &PgPool,
    caller: &Identity,
    target: i32,
    escaped: &str,
    add: bool,
    room: &str,
) -> Result<Vec<Effect>> {
    let result = if add {
        sqlx::query!(
            "INSERT INTO user_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            caller.user.0,
            target
        )
        .execute(pool)
        .await?
    } else {
        sqlx::query!(
            "DELETE FROM user_blocks WHERE user_id=$1 AND blocked_id=$2",
            caller.user.0,
            target
        )
        .execute(pool)
        .await?
    };
    if result.rows_affected() == 0 {
        return Ok(vec![warning(&if add {
            format!("\"{escaped}\" is already blocked.")
        } else {
            format!("\"{escaped}\" is not blocked, so you cannot unblock them.")
        })]);
    }
    let message = if add {
        format!(
            "Successfully blocked \"{escaped}\". You can no longer join or spectate each other's tables or send each other private messages."
        )
    } else {
        format!("Successfully unblocked \"{escaped}\".")
    };
    Ok(vec![
        notice(&caller.name, &message, room),
        Publication::BlocksChanged {
            user_id: caller.user,
            target_id: UserId(target),
            // The other user may have blocked this one too.
            blocked: blocked_between(pool, caller.user.0, &[target]).await?,
        }
        .into(),
    ])
}
