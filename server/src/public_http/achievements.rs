//! The achievements on a player's profile. The server works out each one from the player's saved
//! games, so a new achievement also counts the games from before it existed.
use super::{AGGREGATE_STATEMENT_TIMEOUT, PublicState, Result, catalog, scan};
use crate::errors::StatementLimit;
use anyhow::Context as _;
use hanabi_engine::EndCondition;
use hanabi_protocol::{Achievement, AchievementId, Count, DEFAULT_VARIANT_NAME};

/// The fewest players that a game needs to count toward an achievement. Games with 2 players are
/// too easy.
const MIN_PLAYERS: i16 = 3;

/// The wins that unlock most achievements.
const WINS: i64 = 10;

/// What an achievement asks for.
pub(super) enum Goal {
    /// A number of wins, in any of the group's variants.
    Wins(i64),
    /// One win in each of the group's variants.
    OneWinEach,
}

impl Goal {
    /// The wins in each of the group's variants that the goal needs.
    const fn wins_per_variant(&self) -> i64 {
        match self {
            Self::Wins(wins) => *wins,
            Self::OneWinEach => 1,
        }
    }
}

/// An achievement for winning games.
pub(super) struct WinAchievement {
    pub id: AchievementId,
    pub name: &'static str,
    pub goal: Goal,
}

/// The dark suits whose 5-suit variants count toward the dark suits achievement. Dark Orange is left
/// out, as Orange is left out of the special suit achievements.
const DARK_SUITS: [&str; 10] = [
    "Black",
    "Dark Rainbow",
    "Dark Pink",
    "Gray",
    "Dark Brown",
    "Dark Omni",
    "Dark Null",
    "Cocoa Rainbow",
    "Gray Pink",
    "Dark Prism",
];

/// The variants whose wins count toward a group of achievements.
pub(super) enum WinVariants {
    NoVariant,
    /// The 5-suit variant of a special suit, such as "Pink (5 Suits)". Games with 6 suits take too
    /// long to count.
    SpecialSuit(&'static str),
    /// The 5-suit variant of each dark suit.
    DarkSuits,
}

impl WinVariants {
    fn names(&self) -> Vec<String> {
        match self {
            Self::NoVariant => vec![DEFAULT_VARIANT_NAME.to_owned()],
            Self::SpecialSuit(suit) => vec![five_suits(suit)],
            Self::DarkSuits => DARK_SUITS.iter().map(|suit| five_suits(suit)).collect(),
        }
    }

    /// What an achievement of this group asks for, in words.
    fn description(&self, goal: &Goal) -> String {
        match (self, goal) {
            (Self::DarkSuits, Goal::OneWinEach) => format!(
                "Get the max score in a 5-suit game with each dark suit: {}",
                DARK_SUITS.join(", ")
            ),
            (_, Goal::OneWinEach) => format!(
                "Get the max score in a game of each variant: {}",
                self.names().join(", ")
            ),
            (_, Goal::Wins(wins)) => format!(
                "Get the max score in {wins} games of {}.",
                self.names().join(" or ")
            ),
        }
    }
}

fn five_suits(suit: &str) -> String {
    format!("{suit} (5 Suits)")
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
                goal: Goal::Wins(WINS),
            },
            WinAchievement {
                id: AchievementId::NoVariant100Wins,
                name: "Core Mastery",
                goal: Goal::Wins(100),
            },
        ],
    },
    special_suit(
        "Rainbow",
        &[WinAchievement {
            id: AchievementId::Rainbow10Wins,
            name: "Rainbow Wrangler",
            goal: Goal::Wins(WINS),
        }],
    ),
    special_suit(
        "Pink",
        &[WinAchievement {
            id: AchievementId::Pink10Wins,
            name: "Tickled Pink",
            goal: Goal::Wins(WINS),
        }],
    ),
    special_suit(
        "White",
        &[WinAchievement {
            id: AchievementId::White10Wins,
            name: "Whiteout",
            goal: Goal::Wins(WINS),
        }],
    ),
    special_suit(
        "Brown",
        &[WinAchievement {
            id: AchievementId::Brown10Wins,
            name: "Brown Belt",
            goal: Goal::Wins(WINS),
        }],
    ),
    special_suit(
        "Omni",
        &[WinAchievement {
            id: AchievementId::Omni10Wins,
            name: "Omnipotent",
            goal: Goal::Wins(WINS),
        }],
    ),
    special_suit(
        "Null",
        &[WinAchievement {
            id: AchievementId::Null10Wins,
            name: "Null and Void",
            goal: Goal::Wins(WINS),
        }],
    ),
    special_suit(
        "Muddy Rainbow",
        &[WinAchievement {
            id: AchievementId::MuddyRainbow10Wins,
            name: "Stuck in the Mud",
            goal: Goal::Wins(WINS),
        }],
    ),
    special_suit(
        "Light Pink",
        &[WinAchievement {
            id: AchievementId::LightPink10Wins,
            name: "Light Touch",
            goal: Goal::Wins(WINS),
        }],
    ),
    special_suit(
        "Prism",
        &[WinAchievement {
            id: AchievementId::Prism10Wins,
            name: "Prismatic",
            goal: Goal::Wins(WINS),
        }],
    ),
    WinGroup {
        variants: WinVariants::DarkSuits,
        achievements: &[WinAchievement {
            id: AchievementId::DarkSuitsWins,
            name: "Lights Out",
            goal: Goal::OneWinEach,
        }],
    },
];

/// A player's progress toward each achievement.
///
/// A win is a game that reached the max score without an option that changes the game, such as
/// "One Extra Card" or detrimental characters, and with at least `MIN_PLAYERS` players. Speedruns
/// and timed games count.
pub(super) async fn achievements(state: &PublicState, user: i32) -> Result<Vec<Achievement>> {
    // One row for each variant of each group: its ID and max score, and the wins that the group
    // needs in it. Each group's variants are a range of these rows.
    let mut variant_ids = Vec::new();
    let mut max_scores = Vec::new();
    let mut limits = Vec::new();
    let mut ranges = Vec::new();
    for group in WIN_GROUPS {
        let most_wins = group
            .achievements
            .iter()
            .map(|achievement| achievement.goal.wins_per_variant())
            .max()
            .unwrap_or_default();
        let start = variant_ids.len();
        for name in group.variants.names() {
            let variant = catalog::variants()
                .iter()
                .find(|variant| variant.name == name)
                .with_context(|| format!("The catalog has no variant named: {name}"))?;
            variant_ids.push(i16::try_from(variant.id)?);
            max_scores.push(i16::try_from(variant.max_score)?);
            limits.push(most_wins);
        }
        ranges.push(start..variant_ids.len());
    }
    let rows: Vec<i32> = (0..variant_ids.len())
        .map(i32::try_from)
        .collect::<std::result::Result<_, _>>()?;
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    let mut transaction = scan(state).await?;
    // The times of the first wins in each row's variant, up to the wins that its group needs.
    let wins = sqlx::query!(
        "SELECT w.row AS \"row!\",w.datetime_finished AS \"datetime_finished!\" FROM (
           SELECT v.row,v.most,g.datetime_finished,
             row_number() OVER (PARTITION BY v.row ORDER BY g.datetime_finished,g.id) AS n
           FROM game_participants p JOIN games g ON g.id=p.game_id
           JOIN unnest($2::smallint[],$3::smallint[],$4::int[],$5::bigint[])
             AS v(variant_id,max_score,row,most)
             ON v.variant_id=g.variant_id AND v.max_score=g.score
           WHERE p.user_id=$1 AND g.end_condition=$6 AND g.num_players>=$7
           AND NOT (g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card
             OR g.all_or_nothing OR g.detrimental_characters)
         ) w WHERE w.n<=w.most ORDER BY w.row,w.n",
        user,
        &variant_ids,
        &max_scores,
        &rows,
        &limits,
        normal_end,
        MIN_PLAYERS,
    )
    .fetch_all(&mut *transaction)
    .await
    .context(StatementLimit(AGGREGATE_STATEMENT_TIMEOUT))?;
    transaction.commit().await?;
    let mut wins_by_row = vec![Vec::new(); variant_ids.len()];
    for win in wins {
        wins_by_row[usize::try_from(win.row)?].push(win.datetime_finished);
    }
    let mut achievements = Vec::new();
    for (group, range) in WIN_GROUPS.iter().zip(ranges) {
        let variant_wins = &wins_by_row[range];
        for achievement in group.achievements {
            // How far the player has come, the goal, and when the player reached it.
            let (progress, goal, date) = match achievement.goal {
                Goal::Wins(goal) => {
                    let mut wins: Vec<_> = variant_wins.iter().flatten().copied().collect();
                    wins.sort_unstable();
                    let date = usize::try_from(goal - 1)
                        .ok()
                        .and_then(|index| wins.get(index))
                        .copied();
                    (i64::try_from(wins.len())?.min(goal), goal, date)
                }
                Goal::OneWinEach => {
                    let firsts: Vec<_> = variant_wins
                        .iter()
                        .filter_map(|wins| wins.first())
                        .collect();
                    let goal = i64::try_from(variant_wins.len())?;
                    let progress = i64::try_from(firsts.len())?;
                    let date = (progress == goal)
                        .then(|| firsts.iter().max().copied().copied())
                        .flatten();
                    (progress, goal, date)
                }
            };
            achievements.push(Achievement {
                id: achievement.id,
                name: achievement.name.into(),
                description: group.variants.description(&achievement.goal),
                progress: Count::try_from(progress)?,
                goal: Count::try_from(goal)?,
                date_unlocked: date.map(Into::into),
            });
        }
    }
    Ok(achievements)
}
