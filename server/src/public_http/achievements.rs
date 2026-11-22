//! The achievements on a player's profile. The server works out each one from the player's saved
//! games, so a new achievement also counts the games from before it existed.
use super::{AGGREGATE_STATEMENT_TIMEOUT, PublicState, Result, catalog, scan};
use crate::errors::StatementLimit;
use anyhow::Context as _;
use hanabi_engine::EndCondition;
use hanabi_protocol::{
    Achievement, AchievementId, Count, DEFAULT_VARIANT_ID, DEFAULT_VARIANT_NAME,
};

/// The wins in No Variant that unlock the "I've Got the Hang of This" achievement.
pub(super) const NO_VARIANT_WINS_GOAL: i64 = 10;

/// A player's progress toward each achievement.
pub(super) async fn achievements(state: &PublicState, user: i32) -> Result<Vec<Achievement>> {
    Ok(vec![no_variant_wins(state, user).await?])
}

/// A win is a game that reached the max score without an option that makes the game easier, which
/// the score pages also count as a max score.
async fn no_variant_wins(state: &PublicState, user: i32) -> Result<Achievement> {
    let variant = catalog::variant(i64::from(DEFAULT_VARIANT_ID.get()))
        .context("The catalog has the default variant.")?;
    let variant_id = i16::try_from(DEFAULT_VARIANT_ID.get())?;
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    let mut transaction = scan(state).await?;
    // The times of the first wins, up to the goal. The last one is when the player unlocked the
    // achievement.
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
        NO_VARIANT_WINS_GOAL,
    )
    .fetch_all(&mut *transaction)
    .await
    .context(StatementLimit(AGGREGATE_STATEMENT_TIMEOUT))?;
    transaction.commit().await?;
    let progress = i64::try_from(wins.len())?;
    Ok(Achievement {
        id: AchievementId::NoVariantWins,
        name: "I've Got the Hang of This".into(),
        description: format!(
            "Get the max score in {NO_VARIANT_WINS_GOAL} games of {DEFAULT_VARIANT_NAME}."
        ),
        progress: Count::try_from(progress)?,
        goal: Count::try_from(NO_VARIANT_WINS_GOAL)?,
        date_unlocked: (progress == NO_VARIANT_WINS_GOAL)
            .then(|| wins.last().copied())
            .flatten()
            .map(Into::into),
    })
}
