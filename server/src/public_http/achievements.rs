//! The achievements on a player's profile. The server works out each one from the player's saved
//! games, so a new achievement also counts the games from before it existed.
use super::{AGGREGATE_STATEMENT_TIMEOUT, PublicState, Result, catalog, scan};
use crate::errors::StatementLimit;
use anyhow::Context as _;
use hanabi_engine::EndCondition;
use hanabi_protocol::{Achievement, AchievementId, Count, DEFAULT_VARIANT_NAME};

/// An achievement for a number of wins.
pub(super) struct WinAchievement {
    pub id: AchievementId,
    pub name: &'static str,
    /// The wins that unlock the achievement.
    pub goal: i64,
}

/// Achievements that count the wins in the same variants.
pub(super) struct WinGroup {
    /// The names of the variants whose wins count.
    pub variants: &'static [&'static str],
    pub achievements: &'static [WinAchievement],
}

/// Every achievement, in the order that a profile shows them.
pub(super) const WIN_GROUPS: &[WinGroup] = &[
    WinGroup {
        variants: &[DEFAULT_VARIANT_NAME],
        achievements: &[
            WinAchievement {
                id: AchievementId::NoVariant10Wins,
                name: "I've Got the Hang of This",
                goal: 10,
            },
            WinAchievement {
                id: AchievementId::NoVariant100Wins,
                name: "Core Mastery",
                goal: 100,
            },
        ],
    },
    WinGroup {
        variants: &["Rainbow (5 Suits)", "Rainbow (6 Suits)"],
        achievements: &[WinAchievement {
            id: AchievementId::Rainbow10Wins,
            name: "Rainbow Wrangler",
            goal: 10,
        }],
    },
];

/// A player's progress toward each achievement.
pub(super) async fn achievements(state: &PublicState, user: i32) -> Result<Vec<Achievement>> {
    let mut achievements = Vec::new();
    for group in WIN_GROUPS {
        achievements.extend(group_achievements(state, user, group).await?);
    }
    Ok(achievements)
}

/// A win is a game that reached the max score without an option that changes the game, such as
/// "One Extra Card" or detrimental characters. Speedruns and timed games count.
async fn group_achievements(
    state: &PublicState,
    user: i32,
    group: &WinGroup,
) -> Result<Vec<Achievement>> {
    let mut variant_ids = Vec::new();
    let mut max_scores = Vec::new();
    for name in group.variants {
        let variant = catalog::variants()
            .iter()
            .find(|variant| variant.name == *name)
            .with_context(|| format!("The catalog has no variant named: {name}"))?;
        variant_ids.push(i16::try_from(variant.id)?);
        max_scores.push(i16::try_from(variant.max_score)?);
    }
    let most_wins = group
        .achievements
        .iter()
        .map(|achievement| achievement.goal)
        .max()
        .unwrap_or_default();
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    let mut transaction = scan(state).await?;
    // The times of the first wins, up to the largest goal. The win that reaches a goal is when the
    // player unlocked its achievement.
    let wins = sqlx::query_scalar!(
        "SELECT g.datetime_finished FROM game_participants p JOIN games g ON g.id=p.game_id
         JOIN unnest($2::smallint[],$3::smallint[]) AS v(variant_id,max_score)
           ON v.variant_id=g.variant_id AND v.max_score=g.score
         WHERE p.user_id=$1 AND g.end_condition=$4
         AND NOT (g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card
           OR g.all_or_nothing OR g.detrimental_characters)
         ORDER BY g.datetime_finished, g.id LIMIT $5",
        user,
        &variant_ids,
        &max_scores,
        normal_end,
        most_wins,
    )
    .fetch_all(&mut *transaction)
    .await
    .context(StatementLimit(AGGREGATE_STATEMENT_TIMEOUT))?;
    transaction.commit().await?;
    let num_wins = i64::try_from(wins.len())?;
    let variants = group.variants.join(" or ");
    group
        .achievements
        .iter()
        .map(|achievement| {
            let goal = achievement.goal;
            Ok(Achievement {
                id: achievement.id,
                name: achievement.name.into(),
                description: format!("Get the max score in {goal} games of {variants}."),
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
