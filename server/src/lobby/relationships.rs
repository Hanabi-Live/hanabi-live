use super::{Caller, Effect, notice, warning};
use crate::accounts::{escape_html, normalize_string};
use anyhow::Result;
use serde_json::json;
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

pub async fn friend_ids(pool: &PgPool, id: i32) -> Result<Vec<i32>> {
    Ok(
        sqlx::query_scalar!("SELECT friend_id FROM user_friends WHERE user_id=$1", id)
            .fetch_all(pool)
            .await?,
    )
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
        sqlx::query!("INSERT INTO user_reverse_friends(user_id,friend_id) VALUES($2,$1) ON CONFLICT DO NOTHING", id, target).execute(&mut *tx).await?;
    } else {
        sqlx::query!(
            "DELETE FROM user_friends WHERE user_id=$1 AND friend_id=$2",
            id,
            target
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "DELETE FROM user_reverse_friends WHERE user_id=$2 AND friend_id=$1",
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
    caller: &Caller,
    command: &str,
    name: &str,
    room: &str,
) -> Result<Vec<Effect>> {
    if command == "chatLinked" {
        let names: Vec<String> = sqlx::query_scalar!(
            "SELECT u.username FROM user_linkages l JOIN users u ON u.id=l.linked_id
             WHERE l.user_id=$1 ORDER BY LOWER(u.username) COLLATE \"C\"",
            caller.id
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
        _ => "info",
    };
    let normalized = normalize_string(name);
    if name.is_empty() {
        return Ok(vec![warning(&format!(
            "The format of the /{verb} command is: /{verb} [username]"
        ))]);
    }
    if verb != "info" && normalized == caller.normalized_name {
        return Ok(vec![warning(&format!("You cannot {verb} yourself."))]);
    }
    let user = sqlx::query!(
        "SELECT id, username FROM users WHERE normalized_username=$1",
        normalized
    )
    .fetch_optional(pool)
    .await?;
    let Some(user) = user else {
        return Ok(vec![warning(&format!(
            "The username of \"{}\" does not exist in the database.",
            escape_html(name)
        ))]);
    };
    let target: i32 = user.id;
    let escaped = escape_html(name);
    if verb == "info" {
        let count = crate::database::normal_game_count(pool, target, false).await?;
        let canonical: String = user.username.clone();
        let url: String = canonical
            .bytes()
            .map(|b| {
                if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
                    (b as char).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect();
        return Ok(vec![notice(
            &caller.name,
            &format!(
                "\"{escaped}\" has played {count} non-speedrun games. More stats <a href=\"/scores/{}\" target=\"_blank\" rel=\"noopener noreferrer\">here</a>.",
                escape_html(&url)
            ),
            room,
        )]);
    }
    let add = matches!(verb, "friend" | "link");
    let friend = matches!(verb, "friend" | "unfriend");
    let changed = if friend {
        change_friend(pool, caller.id, target, add).await?
    } else {
        let result = if add {
            sqlx::query!(
                "INSERT INTO user_linkages(user_id,linked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
                caller.id,
                target
            )
            .execute(pool)
            .await?
        } else {
            sqlx::query!(
                "DELETE FROM user_linkages WHERE user_id=$1 AND linked_id=$2",
                caller.id,
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
        effects.push(Effect::RelationshipChanged {
            user_id: caller.id,
            target_id: target,
            added: add,
        });
        effects.push(Effect::ToSelf {
            command: "friends".into(),
            data: json!({"friends":friends(pool, caller.id).await?}),
        });
    }
    Ok(effects)
}
