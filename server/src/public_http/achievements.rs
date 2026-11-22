//! The achievements on a player's profile. The server works out each one from the player's saved
//! games, so a new achievement also counts the games from before it existed.
use super::{AGGREGATE_STATEMENT_TIMEOUT, PublicState, Result, catalog, scan};
use crate::errors::StatementLimit;
use anyhow::Context as _;
use hanabi_engine::EndCondition;
use hanabi_protocol::{Achievement, AchievementId, Count, DEFAULT_VARIANT_NAME};

/// The wins that unlock most achievements.
const WINS: i64 = 10;

/// An achievement for a number of wins.
pub(super) struct WinAchievement {
    pub id: AchievementId,
    pub name: &'static str,
    /// The wins that unlock the achievement.
    pub goal: i64,
}

/// The variants whose wins count toward a group of achievements.
pub(super) enum WinVariants {
    NoVariant,
    /// The 5-suit variant of a special suit, such as "Pink (5 Suits)". Games with 6 suits take too
    /// long to count.
    SpecialSuit(&'static str),
}

impl WinVariants {
    fn names(&self) -> Vec<String> {
        match self {
            Self::NoVariant => vec![DEFAULT_VARIANT_NAME.to_owned()],
            Self::SpecialSuit(suit) => {
                vec![format!("{suit} (5 Suits)")]
            }
        }
    }
}

/// Achievements that count the wins in the same variants.
pub(super) struct WinGroup {
    pub variants: WinVariants,
    pub achievements: &'static [WinAchievement],
}

/// A group with one achievement, for `WINS` wins with a special suit.
const fn special_suit(suit: &'static str, achievement: &'static [WinAchievement]) -> WinGroup {
    WinGroup {
        variants: WinVariants::SpecialSuit(suit),
        achievements: achievement,
    }
}

/// Every achievement, in the order that a profile shows them.
pub(super) const WIN_GROUPS: &[WinGroup] = &[
    WinGroup {
        variants: WinVariants::NoVariant,
        achievements: &[
            WinAchievement {
                id: AchievementId::NoVariant10Wins,
                name: "I've Got the Hang of This",
                goal: WINS,
            },
            WinAchievement {
                id: AchievementId::NoVariant100Wins,
                name: "Core Mastery",
                goal: 100,
            },
        ],
    },
    special_suit(
        "Rainbow",
        &[WinAchievement {
            id: AchievementId::Rainbow10Wins,
            name: "Rainbow Wrangler",
            goal: WINS,
        }],
    ),
    special_suit(
        "Pink",
        &[WinAchievement {
            id: AchievementId::Pink10Wins,
            name: "Tickled Pink",
            goal: WINS,
        }],
    ),
    special_suit(
        "White",
        &[WinAchievement {
            id: AchievementId::White10Wins,
            name: "Whiteout",
            goal: WINS,
        }],
    ),
    special_suit(
        "Brown",
        &[WinAchievement {
            id: AchievementId::Brown10Wins,
            name: "Brown Belt",
            goal: WINS,
        }],
    ),
    special_suit(
        "Omni",
        &[WinAchievement {
            id: AchievementId::Omni10Wins,
            name: "Omnipotent",
            goal: WINS,
        }],
    ),
    special_suit(
        "Null",
        &[WinAchievement {
            id: AchievementId::Null10Wins,
            name: "Null and Void",
            goal: WINS,
        }],
    ),
    special_suit(
        "Muddy Rainbow",
        &[WinAchievement {
            id: AchievementId::MuddyRainbow10Wins,
            name: "Stuck in the Mud",
            goal: WINS,
        }],
    ),
    special_suit(
        "Light Pink",
        &[WinAchievement {
            id: AchievementId::LightPink10Wins,
            name: "Light Touch",
            goal: WINS,
        }],
    ),
    special_suit(
        "Prism",
        &[WinAchievement {
            id: AchievementId::Prism10Wins,
            name: "Prismatic",
            goal: WINS,
        }],
    ),
];

/// A player's progress toward each achievement.
///
/// A win is a game that reached the max score without an option that changes the game, such as
/// "One Extra Card" or detrimental characters. Speedruns and timed games count.
pub(super) async fn achievements(state: &PublicState, user: i32) -> Result<Vec<Achievement>> {
    // One row for each variant: its ID and max score, its group, and the wins that the group needs.
    let mut variant_ids = Vec::new();
    let mut max_scores = Vec::new();
    let mut groups = Vec::new();
    let mut limits = Vec::new();
    let mut descriptions = Vec::new();
    for (index, group) in WIN_GROUPS.iter().enumerate() {
        let names = group.variants.names();
        let most_wins = group
            .achievements
            .iter()
            .map(|achievement| achievement.goal)
            .max()
            .unwrap_or_default();
        for name in &names {
            let variant = catalog::variants()
                .iter()
                .find(|variant| variant.name == *name)
                .with_context(|| format!("The catalog has no variant named: {name}"))?;
            variant_ids.push(i16::try_from(variant.id)?);
            max_scores.push(i16::try_from(variant.max_score)?);
            groups.push(i32::try_from(index)?);
            limits.push(most_wins);
        }
        descriptions.push(names.join(" or "));
    }
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    let mut transaction = scan(state).await?;
    // The times of each group's first wins, up to its largest goal. The win that reaches a goal is
    // when the player unlocked its achievement.
    let rows = sqlx::query!(
        "SELECT w.grp AS \"grp!\",w.datetime_finished AS \"datetime_finished!\" FROM (
           SELECT v.grp,v.most,g.datetime_finished,
             row_number() OVER (PARTITION BY v.grp ORDER BY g.datetime_finished,g.id) AS n
           FROM game_participants p JOIN games g ON g.id=p.game_id
           JOIN unnest($2::smallint[],$3::smallint[],$4::int[],$5::bigint[])
             AS v(variant_id,max_score,grp,most)
             ON v.variant_id=g.variant_id AND v.max_score=g.score
           WHERE p.user_id=$1 AND g.end_condition=$6
           AND NOT (g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card
             OR g.all_or_nothing OR g.detrimental_characters)
         ) w WHERE w.n<=w.most ORDER BY w.grp,w.n",
        user,
        &variant_ids,
        &max_scores,
        &groups,
        &limits,
        normal_end,
    )
    .fetch_all(&mut *transaction)
    .await
    .context(StatementLimit(AGGREGATE_STATEMENT_TIMEOUT))?;
    transaction.commit().await?;
    let mut wins = vec![Vec::new(); WIN_GROUPS.len()];
    for row in rows {
        wins[usize::try_from(row.grp)?].push(row.datetime_finished);
    }
    let mut achievements = Vec::new();
    for ((group, wins), variants) in WIN_GROUPS.iter().zip(wins).zip(descriptions) {
        let num_wins = i64::try_from(wins.len())?;
        for achievement in group.achievements {
            let goal = achievement.goal;
            achievements.push(Achievement {
                id: achievement.id,
                name: achievement.name.into(),
                description: format!("Get the max score in {goal} games of {variants}."),
                progress: Count::try_from(num_wins.min(goal))?,
                goal: Count::try_from(goal)?,
                date_unlocked: usize::try_from(goal - 1)
                    .ok()
                    .and_then(|index| wins.get(index))
                    .map(|&date| date.into()),
            });
        }
    }
    Ok(achievements)
}
