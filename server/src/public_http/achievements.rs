//! The achievements on a player's profile. The server works out each one from the player's saved
//! games, so a new achievement also counts the games from before it existed.
use super::{AGGREGATE_STATEMENT_TIMEOUT, PublicState, Result, catalog, scan};
use crate::errors::StatementLimit;
use anyhow::Context as _;
use hanabi_engine::EndCondition;
use hanabi_protocol::{
    Achievement, AchievementId, Count, DEFAULT_VARIANT_ID, DEFAULT_VARIANT_NAME,
};

/// The achievements for wins in No Variant: each one's ID, name, and the wins that unlock it.
pub(super) const NO_VARIANT_WIN_ACHIEVEMENTS: [(AchievementId, &str, i64); 2] = [
    (
        AchievementId::NoVariant10Wins,
        "I've Got the Hang of This",
        10,
    ),
    (AchievementId::NoVariant100Wins, "Core Mastery", 100),
];

/// A player's progress toward each achievement.
pub(super) async fn achievements(state: &PublicState, user: i32) -> Result<Vec<Achievement>> {
    no_variant_wins(state, user).await
}

/// A win is a game that reached the max score without an option that makes the game easier, which
/// the score pages also count as a max score.
async fn no_variant_wins(state: &PublicState, user: i32) -> Result<Vec<Achievement>> {
    let variant = catalog::variant(i64::from(DEFAULT_VARIANT_ID.get()))
        .context("The catalog has the default variant.")?;
    let variant_id = i16::try_from(DEFAULT_VARIANT_ID.get())?;
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    let most_wins = NO_VARIANT_WIN_ACHIEVEMENTS
        .iter()
        .map(|&(_, _, goal)| goal)
        .max()
        .unwrap_or_default();
    let mut transaction = scan(state).await?;
    // The times of the first wins, up to the largest goal. The win that reaches a goal is when the
    // player unlocked its achievement.
    let wins = sqlx::query_scalar!(
        "SELECT g.datetime_finished FROM game_participants p JOIN games g ON g.id=p.game_id
         WHERE p.user_id=$1 AND g.variant_id=$2 AND g.score=$3 AND g.end_condition=$4
         AND NOT (g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card
           OR g.all_or_nothing)
         ORDER BY g.datetime_finished, g.id LIMIT $5",
        user,
        variant_id,
        i16::try_from(variant.max_score)?,
        normal_end,
        most_wins,
    )
    .fetch_all(&mut *transaction)
    .await
    .context(StatementLimit(AGGREGATE_STATEMENT_TIMEOUT))?;
    transaction.commit().await?;
    let num_wins = i64::try_from(wins.len())?;
    NO_VARIANT_WIN_ACHIEVEMENTS
        .iter()
        .map(|&(id, name, goal)| {
            Ok(Achievement {
                id,
                name: name.into(),
                description: format!(
                    "Get the max score in {goal} games of {DEFAULT_VARIANT_NAME}."
                ),
                progress: Count::try_from(num_wins.min(goal))?,
                goal: Count::try_from(goal)?,
                date_unlocked: usize::try_from(goal - 1)
                    .ok()
                    .and_then(|index| wins.get(index))
                    .map(|&date| date.into()),
            })
        })
        .collect()
}
