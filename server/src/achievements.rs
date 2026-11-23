//! The achievements that players unlock by winning games. The server works out each one from the
//! saved games, so a new achievement also counts the games from before it existed. The
//! `user_achievements` table keeps the unlocked ones, so that a profile can show how many players
//! have each one. The server writes a game's players' unlocks after it saves the game, and writes
//! everyone's again when it starts, so that a changed rule reaches the table.
use crate::{
    model::Snapshot,
    store::{LockSpace, advisory_lock},
};
use anyhow::{Context as _, Result};
use hanabi_engine::EndCondition;
use hanabi_protocol::{
    Achievement, AchievementId, Count, DEFAULT_VARIANT_NAME, MIN_ACHIEVEMENT_PLAYERS,
};
use sqlx::{PgConnection, PgPool};
use std::collections::HashMap;
use time::OffsetDateTime;

/// The wins that unlock most achievements.
const WINS: i64 = 10;

/// How long the startup sync may run. It reads every counting win of every player.
const SYNC_STATEMENT_TIMEOUT: std::time::Duration = std::time::Duration::from_mins(2);

/// A variant that an achievement counts the wins in.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum CatalogVariant {
    NoVariant,
    /// The variant of a suit with a number of suits, such as "Pink (5 Suits)".
    Suits(&'static str, u8),
    /// A variant of the catalog, by its full name, such as "Ambiguous (6 Suits)".
    Named(&'static str),
}

impl CatalogVariant {
    fn name(self) -> String {
        match self {
            Self::NoVariant => DEFAULT_VARIANT_NAME.to_owned(),
            Self::Suits(suit, suits) => format!("{suit} ({suits} Suits)"),
            Self::Named(name) => name.to_owned(),
        }
    }

    /// The variant in the catalog: its ID and its max score.
    fn find(self) -> Result<(i16, i16)> {
        find(&self.name())
    }
}

/// The variant in the catalog with this name: its ID and its max score.
fn find(name: &str) -> Result<(i16, i16)> {
    let variant = hanabi_engine::variants()
        .iter()
        .find(|v| v.name == name)
        .with_context(|| format!("The catalog has no variant named: {name}"))?;
    Ok((
        i16::try_from(variant.id)?,
        i16::try_from(variant.max_score)?,
    ))
}

/// The games whose wins count toward an achievement.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Games {
    Variant(CatalogVariant),
    /// The games of every variant with this many players.
    Players(u8),
    /// The games of the 5-suit variants with a special rank, such as "Rainbow-Ones (5 Suits)" and
    /// "Rainbow-Fives (5 Suits)". The catalog has special ranks only for ones and fives.
    SpecialRank(&'static str),
    /// The games of every variant with a rule and a number of suits, such as Up or Down with 5
    /// suits, alone or with other rules and suits.
    Rule(VariantRule, u8),
}

/// A rule of a variant that an achievement counts the wins with.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum VariantRule {
    /// The rank whose cards have one copy each, such as 4 in Critical Fours.
    CriticalRank(i32),
    ScarceOnes,
    ClueStarved,
    /// Color clues touch no cards, but rank clues do.
    ColorBlind,
    /// Rank clues touch no cards, but color clues do.
    NumberBlind,
    /// No clue touches any card.
    TotallyBlind,
    CowAndPig,
    Duck,
    OddsAndEvens,
    ReversedSuit,
    UpOrDown,
    ThrowItInAHole,
    Sudoku,
}

impl VariantRule {
    fn of(self, variant: &hanabi_engine::Variant) -> bool {
        match self {
            Self::CriticalRank(rank) => variant.critical_rank == Some(rank),
            Self::ScarceOnes => variant.scarce_ones,
            Self::ClueStarved => variant.clue_starved,
            Self::ColorBlind => {
                variant.color_clues_touch_nothing && !variant.rank_clues_touch_nothing
            }
            Self::NumberBlind => {
                variant.rank_clues_touch_nothing && !variant.color_clues_touch_nothing
            }
            Self::TotallyBlind => {
                variant.color_clues_touch_nothing && variant.rank_clues_touch_nothing
            }
            Self::CowAndPig => variant.cow_and_pig,
            Self::Duck => variant.duck,
            Self::OddsAndEvens => variant.odds_and_evens,
            // Not `has_reversed_suits`, which also counts Up or Down.
            Self::ReversedSuit => variant.suits.iter().any(|suit| suit.reversed),
            Self::UpOrDown => variant.up_or_down,
            Self::ThrowItInAHole => variant.throw_it_in_a_hole,
            Self::Sudoku => variant.sudoku,
        }
    }

    fn name(self) -> String {
        let name = match self {
            Self::CriticalRank(rank) => return format!("critical {rank}s"),
            Self::ScarceOnes => "Scarce Ones",
            Self::ClueStarved => "Clue Starved",
            Self::ColorBlind => "Color Blind",
            Self::NumberBlind => "Number Blind",
            Self::TotallyBlind => "Totally Blind",
            Self::CowAndPig => "Cow and Pig",
            Self::Duck => "Duck",
            Self::OddsAndEvens => "Odds and Evens",
            Self::ReversedSuit => "a reversed suit",
            Self::UpOrDown => "Up or Down",
            Self::ThrowItInAHole => "Throw It in a Hole",
            Self::Sudoku => "Sudoku",
        };
        name.to_owned()
    }
}

/// The ranks that the catalog has special-rank variants for.
const SPECIAL_RANKS: [&str; 2] = ["Ones", "Fives"];

impl Games {
    fn description(self) -> String {
        match self {
            Self::Variant(variant) => format!("games of {}", variant.name()),
            Self::Players(players) => format!("games with {players} players"),
            // The text does not name the ranks, which may change.
            Self::SpecialRank(rank) => format!(
                "games with a {} special rank and 5 suits",
                rank.replace('-', " ")
            ),
            Self::Rule(rule, suits) => format!("games with {} ({suits} Suits)", rule.name()),
        }
    }
}

/// What an achievement asks for.
pub(crate) enum Rule {
    /// A number of wins.
    Wins { games: Games, goal: i64 },
    /// A number of wins in a row in a variant, with the same number of players. Each player count
    /// has its own streak. Any other result in the games that could count, with that player count,
    /// breaks the streak. Games that cannot count, such as games with 2 players, do not.
    Streak {
        variant: CatalogVariant,
        length: i64,
    },
    /// One win in the variant of each suit with a number of suits, such as each dark suit with 6
    /// suits.
    OneWinEach {
        /// What the suits are, such as "dark suit".
        kind: &'static str,
        /// The number of suits of each variant.
        suit_count: u8,
        suits: &'static [&'static str],
    },
}

impl Rule {
    /// The games whose wins the rule counts. `OneWinEach` needs a win in each of them. A streak
    /// has its own query, so it has none.
    fn games(&self) -> Vec<Games> {
        match self {
            Self::Wins { games, .. } => vec![*games],
            Self::Streak { .. } => Vec::new(),
            Self::OneWinEach {
                suit_count, suits, ..
            } => suits
                .iter()
                .map(|&suit| Games::Variant(CatalogVariant::Suits(suit, *suit_count)))
                .collect(),
        }
    }

    /// The wins in each of the rule's games that the rule needs.
    const fn wins_per_variant(&self) -> i64 {
        match self {
            Self::Wins { goal, .. } | Self::Streak { length: goal, .. } => *goal,
            Self::OneWinEach { .. } => 1,
        }
    }

    fn description(&self) -> String {
        match self {
            Self::Wins { games, goal } => {
                format!("Get the max score in {goal} {}.", games.description())
            }
            Self::Streak { variant, length } => format!(
                "Get the max score in {length} games of {} in a row, with the same number of \
                 players.",
                variant.name()
            ),
            Self::OneWinEach {
                kind,
                suit_count,
                suits,
            } => format!(
                "Get the max score in a {suit_count}-suit game with each {kind}: {}",
                suits.join(", ")
            ),
        }
    }
}

pub(crate) struct Definition {
    pub id: AchievementId,
    pub name: &'static str,
    pub rule: Rule,
}

impl Definition {
    /// What the achievement asks for, in words.
    pub(crate) fn description(&self) -> String {
        self.rule.description()
    }
}

/// An achievement that a player unlocked with the game that they just finished.
pub(crate) struct Unlocked {
    pub user: i32,
    pub achievement: &'static Definition,
}

/// An achievement for `WINS` wins in the variant of a special suit with a number of suits.
const fn special_suit(
    id: AchievementId,
    name: &'static str,
    suit: &'static str,
    suits: u8,
) -> Definition {
    Definition {
        id,
        name,
        rule: Rule::Wins {
            games: Games::Variant(CatalogVariant::Suits(suit, suits)),
            goal: WINS,
        },
    }
}

/// An achievement for `WINS` wins with a number of players.
const fn players(id: AchievementId, name: &'static str, players: u8) -> Definition {
    Definition {
        id,
        name,
        rule: Rule::Wins {
            games: Games::Players(players),
            goal: WINS,
        },
    }
}

/// An achievement for `WINS` wins in a variant of the catalog, by its full name.
const fn named(id: AchievementId, name: &'static str, variant: &'static str) -> Definition {
    Definition {
        id,
        name,
        rule: Rule::Wins {
            games: Games::Variant(CatalogVariant::Named(variant)),
            goal: WINS,
        },
    }
}

/// An achievement for `WINS` wins in the variants with a rule and a number of suits.
const fn rule(id: AchievementId, name: &'static str, rule: VariantRule, suits: u8) -> Definition {
    Definition {
        id,
        name,
        rule: Rule::Wins {
            games: Games::Rule(rule, suits),
            goal: WINS,
        },
    }
}

/// An achievement for `WINS` wins in the 5-suit variants of a special rank.
const fn special_rank(id: AchievementId, name: &'static str, rank: &'static str) -> Definition {
    Definition {
        id,
        name,
        rule: Rule::Wins {
            games: Games::SpecialRank(rank),
            goal: WINS,
        },
    }
}

/// Every achievement, in the order that a profile shows them.
pub(crate) const ACHIEVEMENTS: &[Definition] = &[
    Definition {
        id: AchievementId::NoVariant10Wins,
        name: "I've Got the Hang of This",
        rule: Rule::Wins {
            games: Games::Variant(CatalogVariant::NoVariant),
            goal: WINS,
        },
    },
    players(AchievementId::ThreePlayers10Wins, "Power Trio", 3),
    players(AchievementId::FourPlayers10Wins, "Four-Part Harmony", 4),
    players(AchievementId::FivePlayers10Wins, "High Five", 5),
    Definition {
        id: AchievementId::NoVariant5Streak,
        name: "On a Roll",
        rule: Rule::Streak {
            variant: CatalogVariant::NoVariant,
            length: 5,
        },
    },
    Definition {
        id: AchievementId::NoVariant100Wins,
        name: "Core Mastery",
        rule: Rule::Wins {
            games: Games::Variant(CatalogVariant::NoVariant),
            goal: 100,
        },
    },
    special_suit(AchievementId::Black10Wins, "Pitch Black", "Black", 6),
    special_suit(
        AchievementId::Rainbow10Wins,
        "Rainbow Wrangler",
        "Rainbow",
        5,
    ),
    special_suit(AchievementId::Pink10Wins, "Tickled Pink", "Pink", 5),
    special_suit(AchievementId::White10Wins, "Whiteout", "White", 5),
    special_suit(AchievementId::Brown10Wins, "Brown Belt", "Brown", 5),
    special_suit(AchievementId::Omni10Wins, "Omnipotent", "Omni", 5),
    special_suit(AchievementId::Null10Wins, "Null and Void", "Null", 5),
    special_suit(
        AchievementId::MuddyRainbow10Wins,
        "Stuck in the Mud",
        "Muddy Rainbow",
        5,
    ),
    special_suit(
        AchievementId::LightPink10Wins,
        "Light Touch",
        "Light Pink",
        5,
    ),
    special_suit(AchievementId::Prism10Wins, "Prismatic", "Prism", 5),
    special_suit(AchievementId::Orange10Wins, "Citrus Twist", "Orange", 5),
    Definition {
        id: AchievementId::DarkSuitsWins,
        name: "Lights Out",
        rule: Rule::OneWinEach {
            kind: "dark suit",
            suit_count: 6,
            suits: &[
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
                "Dark Orange",
            ],
        },
    },
    special_rank(AchievementId::RainbowRank10Wins, "Rainbow's End", "Rainbow"),
    special_rank(AchievementId::PinkRank10Wins, "Pink Slip", "Pink"),
    special_rank(AchievementId::WhiteRank10Wins, "White Knuckles", "White"),
    special_rank(AchievementId::BrownRank10Wins, "Brownout", "Brown"),
    special_rank(AchievementId::OmniRank10Wins, "Omnivore", "Omni"),
    special_rank(AchievementId::NullRank10Wins, "Null Hypothesis", "Null"),
    special_rank(
        AchievementId::MuddyRainbowRank10Wins,
        "Mud Season",
        "Muddy-Rainbow",
    ),
    special_rank(
        AchievementId::LightPinkRank10Wins,
        "Rose-Tinted",
        "Light-Pink",
    ),
    special_rank(
        AchievementId::DeceptiveRank10Wins,
        "Smoke and Mirrors",
        "Deceptive",
    ),
    named(
        AchievementId::Ambiguous10Wins,
        "Mixed Signals",
        "Ambiguous (6 Suits)",
    ),
    named(
        AchievementId::VeryAmbiguous10Wins,
        "Seeing Double",
        "Very Ambiguous (6 Suits)",
    ),
    named(
        AchievementId::ExtremelyAmbiguous10Wins,
        "Lost in the Fog",
        "Extremely Ambiguous (6 Suits)",
    ),
    named(
        AchievementId::DualColor5Suits10Wins,
        "Two-Tone",
        "Dual-Color (5 Suits)",
    ),
    named(
        AchievementId::DualColor6Suits10Wins,
        "Double Vision",
        "Dual-Color (6 Suits)",
    ),
    rule(
        AchievementId::CriticalTwos10Wins,
        "Pair Bond",
        VariantRule::CriticalRank(2),
        5,
    ),
    rule(
        AchievementId::CriticalThrees10Wins,
        "Triple Threat",
        VariantRule::CriticalRank(3),
        5,
    ),
    rule(
        AchievementId::CriticalFours10Wins,
        "Four-Leaf Clover",
        VariantRule::CriticalRank(4),
        6,
    ),
    rule(
        AchievementId::ScarceOnes10Wins,
        "Rare Find",
        VariantRule::ScarceOnes,
        6,
    ),
    rule(
        AchievementId::ClueStarved10Wins,
        "Lean Times",
        VariantRule::ClueStarved,
        5,
    ),
    rule(
        AchievementId::ColorBlind10Wins,
        "Shades of Gray",
        VariantRule::ColorBlind,
        5,
    ),
    rule(
        AchievementId::NumberBlind10Wins,
        "Lost Count",
        VariantRule::NumberBlind,
        5,
    ),
    rule(
        AchievementId::TotallyBlind10Wins,
        "Blindfolded",
        VariantRule::TotallyBlind,
        5,
    ),
    rule(
        AchievementId::CowAndPig10Wins,
        "Barnyard Banter",
        VariantRule::CowAndPig,
        5,
    ),
    rule(
        AchievementId::Duck10Wins,
        "Sitting Duck",
        VariantRule::Duck,
        5,
    ),
    rule(
        AchievementId::OddsAndEvens10Wins,
        "Against the Odds",
        VariantRule::OddsAndEvens,
        5,
    ),
    rule(
        AchievementId::ReversedSuit10Wins,
        "Rewind",
        VariantRule::ReversedSuit,
        5,
    ),
    rule(
        AchievementId::UpOrDown10Wins,
        "Ups and Downs",
        VariantRule::UpOrDown,
        6,
    ),
    rule(
        AchievementId::ThrowItInAHole10Wins,
        "Hole in One",
        VariantRule::ThrowItInAHole,
        6,
    ),
    rule(
        AchievementId::Sudoku10Wins,
        "Gridlock",
        VariantRule::Sudoku,
        5,
    ),
];

/// The streak lengths that the achievements ask for in each variant.
fn streaks() -> HashMap<CatalogVariant, Vec<i64>> {
    let mut streaks: HashMap<CatalogVariant, Vec<i64>> = HashMap::new();
    for achievement in ACHIEVEMENTS {
        if let Rule::Streak { variant, length } = achievement.rule {
            streaks.entry(variant).or_default().push(length);
        }
    }
    streaks
}

/// The games that the achievements count, as the queries take them. Each `Games` is a row,
/// numbered from 1. The queries match a game to a row by its variant and max score, and by its
/// player count when the row has one (0 matches any count). A threshold asks for the time of a
/// row's nth win: the first one for every row, so that the query returns the row's count of wins,
/// and the one that reaches each goal.
struct QueryRows {
    games: Vec<Games>,
    variant_ids: Vec<i16>,
    max_scores: Vec<i16>,
    player_counts: Vec<i16>,
    rows: Vec<i64>,
    threshold_rows: Vec<i64>,
    thresholds: Vec<i64>,
}

impl QueryRows {
    fn new() -> Result<Self> {
        let mut rows = Self {
            games: Vec::new(),
            variant_ids: Vec::new(),
            max_scores: Vec::new(),
            player_counts: Vec::new(),
            rows: Vec::new(),
            threshold_rows: Vec::new(),
            thresholds: Vec::new(),
        };
        let mut wins: HashMap<i64, Vec<i64>> = HashMap::new();
        for achievement in ACHIEVEMENTS {
            for games in achievement.rule.games() {
                let row = match rows.row(games) {
                    Some(row) => row,
                    None => rows.add(games)?,
                };
                let needed = wins.entry(row).or_insert_with(|| vec![1]);
                needed.push(achievement.rule.wins_per_variant());
            }
        }
        for (row, mut needed) in wins {
            needed.sort_unstable();
            needed.dedup();
            for n in needed {
                rows.threshold_rows.push(row);
                rows.thresholds.push(n);
            }
        }
        Ok(rows)
    }

    /// Adds a row for `games`, and returns its number.
    fn add(&mut self, games: Games) -> Result<i64> {
        self.games.push(games);
        let row = i64::try_from(self.games.len())?;
        let (variants, players) = match games {
            Games::Variant(variant) => (vec![variant.find()?], 0),
            Games::SpecialRank(rank) => (
                SPECIAL_RANKS
                    .iter()
                    .map(|n| find(&format!("{rank}-{n} (5 Suits)")))
                    .collect::<Result<_>>()?,
                0,
            ),
            Games::Rule(rule, suits) => (
                hanabi_engine::variants()
                    .iter()
                    .filter(|v| v.suits.len() == usize::from(suits) && rule.of(v))
                    .map(|v| Ok((i16::try_from(v.id)?, i16::try_from(v.max_score)?)))
                    .collect::<Result<_>>()?,
                0,
            ),
            Games::Players(players) => (
                hanabi_engine::variants()
                    .iter()
                    .map(|v| Ok((i16::try_from(v.id)?, i16::try_from(v.max_score)?)))
                    .collect::<Result<_>>()?,
                i16::from(players),
            ),
        };
        for (variant_id, max_score) in variants {
            self.variant_ids.push(variant_id);
            self.max_scores.push(max_score);
            self.player_counts.push(players);
            self.rows.push(row);
        }
        Ok(row)
    }

    /// The row of `games`, numbered from 1.
    fn row(&self, games: Games) -> Option<i64> {
        let index = self.games.iter().position(|row| *row == games)?;
        i64::try_from(index + 1).ok()
    }
}

/// A player's wins in a variant: how many, and when each threshold was reached.
#[derive(Default)]
struct VariantWins {
    count: i64,
    times: HashMap<i64, OffsetDateTime>,
}

/// A player's best streak in a variant, and when they reached a length.
struct Streak {
    best: i64,
    reached: Option<OffsetDateTime>,
}

/// A player's results: their wins in each row, and their streaks by variant and length.
#[derive(Default)]
struct Record {
    wins: HashMap<i64, VariantWins>,
    streaks: HashMap<(CatalogVariant, i64), Streak>,
}

/// Each player's record.
type Records = HashMap<i32, Record>;

/// A win is a game that reached the max score without an option that changes the game, such as
/// "One Extra Card" or detrimental characters, and with at least `MIN_ACHIEVEMENT_PLAYERS`
/// players. Speedruns and timed games count.
pub(crate) fn counts(s: &Snapshot) -> bool {
    let o = &s.game.options;
    let Ok(variant) = hanabi_engine::get_variant(&o.variant_name) else {
        return false;
    };
    s.game
        .end
        .is_some_and(|end| end.condition == EndCondition::Normal)
        && s.game.score == variant.max_score
        && o.num_players >= usize::from(MIN_ACHIEVEMENT_PLAYERS)
        && !(o.deck_plays
            || o.empty_clues
            || o.one_extra_card
            || o.one_less_card
            || o.all_or_nothing
            || o.detrimental_characters)
}

/// Each player's wins from the rows of a query: the player, the row, the row's count of wins, a
/// threshold, and when the player reached it.
fn collect(
    records: &mut Records,
    found: impl Iterator<Item = (i32, i64, i64, i64, OffsetDateTime)>,
) {
    for (user, row, count, n, time) in found {
        let variant = records
            .entry(user)
            .or_default()
            .wins
            .entry(row)
            .or_default();
        variant.count = count;
        variant.times.insert(n, time);
    }
}

/// The wins of every player. The query starts from the games that the achievements count, which is
/// faster than starting from each player's games.
async fn all_wins(
    connection: &mut PgConnection,
    rows: &QueryRows,
    records: &mut Records,
) -> Result<()> {
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    let found = sqlx::query!(
        "SELECT x.user_id AS \"user_id!\",x.row AS \"row!\",x.wins AS \"wins!\",x.n AS \"n!\",
           x.datetime_finished AS \"datetime_finished!\"
         FROM (
           SELECT p.user_id,v.row,g.datetime_finished,
             row_number() OVER (PARTITION BY p.user_id,v.row ORDER BY g.datetime_finished,g.id)
               AS n,
             count(*) OVER (PARTITION BY p.user_id,v.row) AS wins
           FROM unnest($1::smallint[],$2::smallint[],$3::smallint[],$4::bigint[])
             AS v(variant_id,max_score,num_players,row)
           JOIN games g ON g.variant_id=v.variant_id AND g.score=v.max_score
             AND (v.num_players=0 OR v.num_players=g.num_players)
           JOIN game_participants p ON p.game_id=g.id
           WHERE g.end_condition=$5 AND g.num_players>=$6
           AND NOT (g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card
             OR g.all_or_nothing OR g.detrimental_characters)
         ) x JOIN unnest($7::bigint[],$8::bigint[]) AS t(row,n) ON t.row=x.row AND t.n=x.n",
        &rows.variant_ids,
        &rows.max_scores,
        &rows.player_counts,
        &rows.rows,
        normal_end,
        i16::from(MIN_ACHIEVEMENT_PLAYERS),
        &rows.threshold_rows,
        &rows.thresholds,
    )
    .fetch_all(connection)
    .await?;
    collect(
        records,
        found
            .into_iter()
            .map(|row| (row.user_id, row.row, row.wins, row.n, row.datetime_finished)),
    );
    Ok(())
}

/// Adds a player's streak to their record.
fn add_streak(
    records: &mut Records,
    variant: CatalogVariant,
    (user, length, best, reached): (i32, i64, i64, Option<OffsetDateTime>),
) {
    records
        .entry(user)
        .or_default()
        .streaks
        .insert((variant, length), Streak { best, reached });
}

/// The streaks in `variant` of every player, for each length in `lengths`. A game that could count
/// extends the streak of its variant and number of players when it is a win, and breaks it
/// otherwise. The query numbers each game, and each game among the wins or among the others; the
/// difference of the two numbers is the same for each game of a run. A player's best streak is the
/// longest at any player count, and they reach a length when the first of their streaks does.
/// `records_of` counts the same streaks from one player's games. The query starts from the
/// variant's games.
async fn all_streaks(
    connection: &mut PgConnection,
    variant: CatalogVariant,
    lengths: &[i64],
    records: &mut Records,
) -> Result<()> {
    let (variant_id, max_score) = variant.find()?;
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    let found = sqlx::query!(
        "WITH counted AS (
           SELECT p.user_id,g.num_players,g.id,g.datetime_finished,
             g.end_condition=$3 AND g.score=$2 AS win
           FROM games g JOIN game_participants p ON p.game_id=g.id
           WHERE g.variant_id=$1 AND g.num_players>=$4
           AND NOT (g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card
             OR g.all_or_nothing OR g.detrimental_characters)
         ), islands AS (
           SELECT user_id,num_players,id,datetime_finished,win,
             row_number() OVER (PARTITION BY user_id,num_players ORDER BY datetime_finished,id)
             -row_number() OVER (PARTITION BY user_id,num_players,win
               ORDER BY datetime_finished,id) AS island
           FROM counted
         ), runs AS (
           SELECT user_id,datetime_finished,
             row_number() OVER (PARTITION BY user_id,num_players,island
               ORDER BY datetime_finished,id) AS length
           FROM islands WHERE win
         )
         SELECT r.user_id AS \"user_id!\",t.length AS \"length!\",max(r.length) AS \"best!\",
           min(r.datetime_finished) FILTER (WHERE r.length=t.length) AS reached
         FROM runs r CROSS JOIN unnest($5::bigint[]) AS t(length) GROUP BY r.user_id,t.length",
        variant_id,
        max_score,
        normal_end,
        i16::from(MIN_ACHIEVEMENT_PLAYERS),
        lengths,
    )
    .fetch_all(connection)
    .await?;
    for row in found {
        add_streak(
            records,
            variant,
            (row.user_id, row.length, row.best, row.reached),
        );
    }
    Ok(())
}

/// A game that a player was in, with what the achievements and the profile read from it.
pub(crate) struct PlayedGame {
    pub user_id: i32,
    pub variant_id: i16,
    pub num_players: i16,
    pub score: i16,
    pub ended_normally: bool,
    /// Whether the game has an option that keeps it from counting, such as "One Extra Card".
    pub has_option: bool,
    pub started: OffsetDateTime,
    pub finished: OffsetDateTime,
}

impl PlayedGame {
    /// Whether the game counts toward the achievements when it is a win. A game that could count
    /// and is not a win breaks a streak.
    fn could_count(&self) -> bool {
        !self.has_option && self.num_players >= i16::from(MIN_ACHIEVEMENT_PLAYERS)
    }

    fn is_win(&self, max_score: i16) -> bool {
        self.ended_normally && self.score == max_score
    }
}

/// The games of the players in `users`, by player, in the order that they finished. A profile and
/// a refresh read each player's games once, and work out the rest from them, since each query
/// over a player's games takes about as long as reading them.
pub(crate) async fn played_games(
    connection: &mut PgConnection,
    users: &[i32],
) -> Result<Vec<PlayedGame>> {
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    Ok(sqlx::query_as!(
        PlayedGame,
        "SELECT p.user_id,g.variant_id,g.num_players,g.score,
           g.end_condition=$2 AS \"ended_normally!\",
           (g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card
             OR g.all_or_nothing OR g.detrimental_characters) AS \"has_option!\",
           g.datetime_started AS started,g.datetime_finished AS finished
         FROM game_participants p JOIN games g ON g.id=p.game_id
         WHERE p.user_id=ANY($1) ORDER BY p.user_id,g.datetime_finished,g.id",
        users,
        normal_end,
    )
    .fetch_all(connection)
    .await?)
}

/// The max score of each variant in the catalog, by ID.
fn max_scores() -> HashMap<i16, i16> {
    hanabi_engine::variants()
        .iter()
        .filter_map(|v| Some((i16::try_from(v.id).ok()?, i16::try_from(v.max_score).ok()?)))
        .collect()
}

/// A win that extends a streak: its variant and number of players, the streak's length with it,
/// and when it finished.
struct StreakStep {
    variant_id: i16,
    num_players: i16,
    length: i64,
    finished: OffsetDateTime,
}

/// Each win of one player that could count, with the streak that it extends. `games` are the
/// player's games in the order that they finished. Each variant and number of players has its own
/// streak. A game that could count and is not a win breaks its streak. A variant that is no longer
/// in the catalog has no max score, so its games are left out.
fn streak_steps(games: &[PlayedGame], max_scores: &HashMap<i16, i16>) -> Vec<StreakStep> {
    let mut streaks: HashMap<(i16, i16), i64> = HashMap::new();
    let mut steps = Vec::new();
    for game in games.iter().filter(|game| game.could_count()) {
        let Some(&max_score) = max_scores.get(&game.variant_id) else {
            continue;
        };
        let length = streaks
            .entry((game.variant_id, game.num_players))
            .or_default();
        if game.is_win(max_score) {
            *length += 1;
            steps.push(StreakStep {
                variant_id: game.variant_id,
                num_players: game.num_players,
                length: *length,
                finished: game.finished,
            });
        } else {
            *length = 0;
        }
    }
    steps
}

/// The records of the players whose games are in `games`, as `all_wins` and `all_streaks` find
/// them for every player. `games` are in the order that `played_games` returns them.
fn records_of(rows: &QueryRows, games: &[PlayedGame]) -> Result<Records> {
    // The rows that each variant's wins count toward, with the row's max score and player count.
    let mut rows_of: HashMap<i16, Vec<(i16, i16, i64)>> = HashMap::new();
    for (((&variant_id, &max_score), &players), &row) in rows
        .variant_ids
        .iter()
        .zip(&rows.max_scores)
        .zip(&rows.player_counts)
        .zip(&rows.rows)
    {
        rows_of
            .entry(variant_id)
            .or_default()
            .push((max_score, players, row));
    }
    let mut thresholds: HashMap<i64, Vec<i64>> = HashMap::new();
    for (&row, &n) in rows.threshold_rows.iter().zip(&rows.thresholds) {
        thresholds.entry(row).or_default().push(n);
    }
    let streak_variants = streaks()
        .into_iter()
        .map(|(variant, lengths)| Ok((variant, variant.find()?.0, lengths)))
        .collect::<Result<Vec<_>>>()?;
    let max_scores = max_scores();
    let mut records = Records::new();
    for player in games.chunk_by(|a, b| a.user_id == b.user_id) {
        let Some(first) = player.first() else {
            continue;
        };
        let mut record = Record::default();
        for game in player
            .iter()
            .filter(|game| game.could_count() && game.ended_normally)
        {
            for &(max_score, players, row) in rows_of.get(&game.variant_id).into_iter().flatten() {
                if game.score != max_score || (players != 0 && players != game.num_players) {
                    continue;
                }
                let wins = record.wins.entry(row).or_default();
                wins.count += 1;
                if thresholds
                    .get(&row)
                    .is_some_and(|needed| needed.contains(&wins.count))
                {
                    wins.times.insert(wins.count, game.finished);
                }
            }
        }
        let steps = streak_steps(player, &max_scores);
        for (variant, variant_id, lengths) in &streak_variants {
            let in_variant: Vec<_> = steps
                .iter()
                .filter(|step| step.variant_id == *variant_id)
                .collect();
            let Some(best) = in_variant.iter().map(|step| step.length).max() else {
                continue;
            };
            for &length in lengths {
                let reached = in_variant
                    .iter()
                    .find(|step| step.length == length)
                    .map(|step| step.finished);
                record
                    .streaks
                    .insert((*variant, length), Streak { best, reached });
            }
        }
        if !record.wins.is_empty() || !record.streaks.is_empty() {
            records.insert(first.user_id, record);
        }
    }
    Ok(records)
}

/// A player's longest streak in any variant, as the streak achievements count one: each variant
/// and number of players has its own streak. Of two streaks that are as long, it is the one that
/// ended first.
pub(crate) struct BestStreak {
    pub length: i64,
    pub variant_id: i16,
    pub num_players: i16,
}

/// The longest streak in one player's games, or `None` when they have no win that counts. `games`
/// are in the order that they finished. A streak reaches its final length at its last win, so the
/// first step that reaches the longest length ends the streak that ended first.
pub(crate) fn best_streak(games: &[PlayedGame]) -> Option<BestStreak> {
    let steps = streak_steps(games, &max_scores());
    let longest = steps.iter().map(|step| step.length).max()?;
    let step = steps.iter().find(|step| step.length == longest)?;
    Some(BestStreak {
        length: step.length,
        variant_id: step.variant_id,
        num_players: step.num_players,
    })
}

/// The records of every player.
async fn all_records(connection: &mut PgConnection, rows: &QueryRows) -> Result<Records> {
    let mut records = Records::new();
    all_wins(connection, rows, &mut records).await?;
    for (variant, lengths) in streaks() {
        all_streaks(connection, variant, &lengths, &mut records).await?;
    }
    Ok(records)
}

/// A player's progress toward an achievement.
struct Standing {
    progress: i64,
    goal: i64,
    unlocked: Option<OffsetDateTime>,
}

fn progress(achievement: &Definition, rows: &QueryRows, record: Option<&Record>) -> Standing {
    let of = |games: Games| {
        rows.row(games)
            .and_then(|row| record.and_then(|record| record.wins.get(&row)))
    };
    match achievement.rule {
        Rule::Streak { variant, length } => {
            let streak = record.and_then(|record| record.streaks.get(&(variant, length)));
            Standing {
                progress: streak.map_or(0, |streak| streak.best.min(length)),
                goal: length,
                unlocked: streak.and_then(|streak| streak.reached),
            }
        }
        Rule::Wins { games, goal } => {
            let wins = of(games);
            Standing {
                progress: wins.map_or(0, |wins| wins.count.min(goal)),
                goal,
                unlocked: wins.and_then(|wins| wins.times.get(&goal).copied()),
            }
        }
        Rule::OneWinEach { .. } => {
            let games = achievement.rule.games();
            let firsts: Vec<_> = games
                .iter()
                .filter_map(|&games| of(games)?.times.get(&1).copied())
                .collect();
            let goal = i64::try_from(games.len()).unwrap_or(i64::MAX);
            let progress = i64::try_from(firsts.len()).unwrap_or(i64::MAX);
            Standing {
                progress,
                goal,
                unlocked: (progress == goal)
                    .then(|| firsts.iter().max().copied())
                    .flatten(),
            }
        }
    }
}

/// The percentage of the players with an achievement who have each one, from 0 to 100, by
/// achievement ID.
async fn rarities(connection: &mut PgConnection) -> Result<HashMap<String, f64>> {
    let counts = sqlx::query!(
        "SELECT achievement,count(*) AS \"players!\",
           (SELECT count(DISTINCT user_id) FROM user_achievements) AS \"total!\"
         FROM user_achievements GROUP BY achievement"
    )
    .fetch_all(connection)
    .await?;
    #[expect(
        clippy::cast_precision_loss,
        reason = "player counts are far below 2^53"
    )]
    Ok(counts
        .into_iter()
        .map(|row| {
            let percentage = if row.total == 0 {
                0.0
            } else {
                row.players as f64 * 100.0 / row.total as f64
            };
            (row.achievement, percentage)
        })
        .collect())
}

/// A player's progress toward each achievement, from their games as `played_games` returns them,
/// and how many players have each one.
pub(crate) async fn achievements(
    connection: &mut PgConnection,
    user: i32,
    games: &[PlayedGame],
) -> Result<Vec<Achievement>> {
    let rows = QueryRows::new()?;
    let records = records_of(&rows, games)?;
    let rarities = rarities(connection).await?;
    ACHIEVEMENTS
        .iter()
        .map(|achievement| {
            let Standing {
                progress,
                goal,
                unlocked,
            } = progress(achievement, &rows, records.get(&user));
            Ok(Achievement {
                id: achievement.id,
                name: achievement.name.into(),
                description: achievement.rule.description(),
                progress: Count::try_from(progress)?,
                goal: Count::try_from(goal)?,
                date_unlocked: unlocked.map(Into::into),
                unlocked_percentage: rarities
                    .get(achievement.id.name())
                    .copied()
                    .unwrap_or_default(),
            })
        })
        .collect()
}

/// Replaces the unlocked achievements of the players in `users`, or of every player when `users` is
/// `None`. Returns each unlocked achievement.
async fn write(
    connection: &mut PgConnection,
    rows: &QueryRows,
    users: Option<&[i32]>,
    records: &Records,
) -> Result<Vec<Unlocked>> {
    let (mut ids, mut achievements, mut times) = (Vec::new(), Vec::new(), Vec::new());
    let mut unlocked = Vec::new();
    for (&user, record) in records {
        for achievement in ACHIEVEMENTS {
            if let Some(time) = progress(achievement, rows, Some(record)).unlocked {
                ids.push(user);
                achievements.push(achievement.id.name());
                times.push(time);
                unlocked.push(Unlocked { user, achievement });
            }
        }
    }
    match users {
        Some(users) => {
            sqlx::query!("DELETE FROM user_achievements WHERE user_id=ANY($1)", users)
                .execute(&mut *connection)
                .await?;
        }
        None => {
            sqlx::query!("DELETE FROM user_achievements")
                .execute(&mut *connection)
                .await?;
        }
    }
    sqlx::query!(
        "INSERT INTO user_achievements(user_id,achievement,datetime_unlocked)
         SELECT u.user_id,u.achievement,u.datetime_unlocked
         FROM unnest($1::integer[],$2::text[],$3::timestamptz[])
           AS u(user_id,achievement,datetime_unlocked)",
        &ids,
        &achievements as &[&str],
        &times,
    )
    .execute(connection)
    .await?;
    Ok(unlocked)
}

/// Writes the unlocked achievements of the players in `users`, after they finished a game, and
/// returns the ones that the game unlocked.
pub(crate) async fn refresh(pool: &PgPool, users: &[i32]) -> Result<Vec<Unlocked>> {
    let rows = QueryRows::new()?;
    let mut transaction = pool.begin().await?;
    // The lock keeps a refresh and the startup sync from writing a player's unlocks from older
    // wins after the other one wrote newer ones.
    advisory_lock(&mut transaction, LockSpace::Achievements, 0).await?;
    let before: std::collections::HashSet<(i32, String)> = sqlx::query!(
        "SELECT user_id,achievement FROM user_achievements WHERE user_id=ANY($1)",
        users
    )
    .fetch_all(&mut *transaction)
    .await?
    .into_iter()
    .map(|row| (row.user_id, row.achievement))
    .collect();
    let games = played_games(&mut transaction, users).await?;
    let records = records_of(&rows, &games)?;
    let unlocked = write(&mut transaction, &rows, Some(users), &records).await?;
    transaction.commit().await?;
    Ok(unlocked
        .into_iter()
        .filter(|u| !before.contains(&(u.user, u.achievement.id.name().to_owned())))
        .collect())
}

/// Writes the unlocked achievements of every player again, so that the table follows the current
/// rules.
pub(crate) async fn sync(pool: &PgPool) -> Result<()> {
    let started = std::time::Instant::now();
    let rows = QueryRows::new()?;
    let mut transaction = pool.begin().await?;
    sqlx::query_scalar!(
        "SELECT set_config('statement_timeout',$1,true)",
        SYNC_STATEMENT_TIMEOUT.as_millis().to_string()
    )
    .fetch_one(&mut *transaction)
    .await?;
    advisory_lock(&mut transaction, LockSpace::Achievements, 0).await?;
    let records = all_records(&mut transaction, &rows).await?;
    write(&mut transaction, &rows, None, &records).await?;
    transaction.commit().await?;
    tracing::info!(
        "Wrote the achievements of {} players in {:?}.",
        records.len(),
        started.elapsed()
    );
    Ok(())
}

#[cfg(test)]
/// Checks that each player's games give the same progress as the queries over every player,
/// which the startup sync uses.
pub(crate) async fn assert_both_ways_agree(connection: &mut PgConnection) {
    let rows = QueryRows::new().unwrap();
    let users: Vec<i32> = sqlx::query_scalar!("SELECT id FROM users ORDER BY id")
        .fetch_all(&mut *connection)
        .await
        .unwrap();
    let all = all_records(connection, &rows).await.unwrap();
    let games = played_games(connection, &users).await.unwrap();
    let each = records_of(&rows, &games).unwrap();
    let standings = |records: &Records| {
        users
            .iter()
            .flat_map(|user| {
                ACHIEVEMENTS.iter().map(|achievement| {
                    let standing = progress(achievement, &rows, records.get(user));
                    (*user, achievement.id, standing.progress, standing.unlocked)
                })
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(standings(&all), standings(&each));
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A player's progress toward each achievement, as their profile shows it.
    async fn achievements_of(connection: &mut PgConnection, user: i32) -> Result<Vec<Achievement>> {
        let games = played_games(connection, &[user]).await?;
        achievements(connection, user, &games).await
    }

    /// Saves `games` wins in No Variant with 3 players, from game `first`, on consecutive days, with
    /// `users` as the players.
    async fn win(pool: &PgPool, first: i32, games: i32, users: &[i32]) {
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state directly"
        )]
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,
              deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,
              detrimental_characters,seed,score,num_turns,end_condition,datetime_started,
              datetime_finished)
            SELECT id,'test',3,0,false,NULL,NULL,false,false,false,false,false,false,false,
              's'||id,25,10,1,'2026-01-01T00:00:00Z'::timestamptz+make_interval(days=>id),
              '2026-01-01T01:00:00Z'::timestamptz+make_interval(days=>id)
            FROM generate_series({first},{last}) id;
            INSERT INTO game_participants(game_id,user_id,seat)
            SELECT g.id,u.id,u.seat-1 FROM generate_series({first},{last}) g(id)
            CROSS JOIN unnest(ARRAY[{users}]::integer[]) WITH ORDINALITY u(id,seat);",
            last = first + games - 1,
            users = users
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(","),
        )))
        .execute(pool)
        .await
        .unwrap();
    }

    /// Each unlocked achievement, as the table stores it, without the streak, which every player of
    /// `win` unlocks.
    async fn unlocked(pool: &PgPool) -> Vec<(i32, String)> {
        sqlx::query!(
            "SELECT user_id,achievement FROM user_achievements WHERE achievement<>$1
             ORDER BY user_id,achievement",
            AchievementId::NoVariant5Streak.name()
        )
        .fetch_all(pool)
        .await
        .unwrap()
        .into_iter()
        .map(|row| (row.user_id, row.achievement))
        .collect()
    }

    #[tokio::test]
    async fn the_table_follows_the_wins_and_gives_the_rarity() {
        let Some(db) = crate::accounts::test_support::TestDb::create().await else {
            return;
        };
        let pool = &db.pool;
        // Carol has an unlock that no win supports, as after a rule changes.
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state directly"
        )]
        sqlx::raw_sql(
            "INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES
              (1,'Alice','alice','test','127.0.0.1'),(2,'Bob','bob','test','127.0.0.1'),
              (3,'Carol','carol','test','127.0.0.1'),(4,'Dave','dave','test','127.0.0.1'),
              (5,'Erin','erin','test','127.0.0.1'),(6,'Frank','frank','test','127.0.0.1'),
              (7,'Gina','gina','test','127.0.0.1');
            INSERT INTO user_achievements(user_id,achievement,datetime_unlocked)
              VALUES(3,'prism10Wins','2026-01-01T00:00:00Z');",
        )
        .execute(pool)
        .await
        .unwrap();
        // Alice wins 10 games. The others play 5 of them each.
        win(pool, 1, 5, &[1, 2, 4]).await;
        win(pool, 6, 5, &[1, 5, 6]).await;
        sync(pool).await.unwrap();
        // Alice's wins have 3 players, so she also has the achievement for 3 players.
        let first = AchievementId::NoVariant10Wins.name().to_owned();
        let three = AchievementId::ThreePlayers10Wins.name().to_owned();
        assert_eq!(
            unlocked(pool).await,
            [(1, first.clone()), (1, three.clone())]
        );
        let mut connection = pool.acquire().await.unwrap();
        let of = |achievements: &[Achievement], id: AchievementId| {
            achievements
                .iter()
                .find(|achievement| achievement.id == id)
                .unwrap()
                .clone()
        };
        let alice = achievements_of(&mut connection, 1).await.unwrap();
        let alice_first = of(&alice, AchievementId::NoVariant10Wins);
        assert_eq!(
            alice_first.date_unlocked.as_ref().unwrap().as_str(),
            "2026-01-11T01:00:00.000Z"
        );
        // Alice, Bob, Dave, Erin, and Frank each have the streak, and only Alice has 10 wins.
        assert!((alice_first.unlocked_percentage - 100.0 / 5.0).abs() < 1e-9);
        assert!(
            of(&alice, AchievementId::NoVariant100Wins)
                .unlocked_percentage
                .abs()
                < f64::EPSILON
        );
        // Bob wins 5 more games with Alice. After the games, both of them have the achievement,
        // and Alice has 15 wins.
        win(pool, 11, 5, &[2, 1, 7]).await;
        let new: Vec<_> = refresh(pool, &[2, 1, 7])
            .await
            .unwrap()
            .into_iter()
            .map(|u| (u.user, u.achievement.id))
            .collect();
        // Only Bob's and Gina's unlocks are new. Alice had hers before the games.
        assert!(new.contains(&(2, AchievementId::NoVariant10Wins)));
        assert!(new.contains(&(7, AchievementId::NoVariant5Streak)));
        assert!(new.iter().all(|(user, _)| *user != 1));
        assert_eq!(
            unlocked(pool).await,
            [
                (1, first.clone()),
                (1, three.clone()),
                (2, first),
                (2, three)
            ]
        );
        let bob = achievements_of(&mut connection, 2).await.unwrap();
        let bob_first = of(&bob, AchievementId::NoVariant10Wins);
        assert_eq!(bob_first.progress.get(), WINS);
        assert_eq!(
            of(&bob, AchievementId::NoVariant100Wins).progress.get(),
            WINS
        );
        // Gina now has the streak too, and Bob has 10 wins.
        assert!((bob_first.unlocked_percentage - 100.0 * 2.0 / 6.0).abs() < 1e-9);
        assert_both_ways_agree(&mut connection).await;
        drop(connection);
        db.close().await;
    }

    #[tokio::test]
    async fn a_streak_needs_wins_in_a_row() {
        let Some(db) = crate::accounts::test_support::TestDb::create().await else {
            return;
        };
        let pool = &db.pool;
        // Alice wins games 1 and 2, loses game 3, and then wins games 4 to 10, all with 3 players.
        // Game 6 has 4 players, so its loss breaks only the streak with 4 players. Game 7 uses
        // "One Extra Card", so its loss does not count. The fifth win in a row is game 10.
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state directly"
        )]
        sqlx::raw_sql(
            "INSERT INTO users(id,username,normalized_username,password_hash,last_ip)
              VALUES(1,'Alice','alice','test','127.0.0.1');
            INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,
              speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,
              detrimental_characters,seed,score,num_turns,end_condition,datetime_started,
              datetime_finished)
            SELECT id,'test',CASE WHEN id=6 THEN 4 ELSE 3 END,0,false,NULL,NULL,false,false,
              false,id=7,false,false,false,'s'||id,CASE WHEN id IN (3,6,7) THEN 20 ELSE 25 END,
              10,1,'2026-01-01T00:00:00Z'::timestamptz+make_interval(days=>id),
              '2026-01-01T01:00:00Z'::timestamptz+make_interval(days=>id)
            FROM generate_series(1,10) id;
            INSERT INTO game_participants(game_id,user_id,seat)
            SELECT id,1,0 FROM generate_series(1,10) id;",
        )
        .execute(pool)
        .await
        .unwrap();
        let streak = |achievements: &[Achievement]| {
            achievements
                .iter()
                .find(|achievement| achievement.id == AchievementId::NoVariant5Streak)
                .unwrap()
                .clone()
        };
        let mut connection = pool.acquire().await.unwrap();
        let achievement = streak(&achievements_of(&mut connection, 1).await.unwrap());
        assert_eq!(achievement.progress.get(), 5);
        assert_eq!(
            achievement.date_unlocked.unwrap().as_str(),
            "2026-01-11T01:00:00.000Z"
        );
        // A loss in game 8 would have left a best streak of 2.
        sqlx::query!("UPDATE games SET score=20 WHERE id=8")
            .execute(pool)
            .await
            .unwrap();
        let achievement = streak(&achievements_of(&mut connection, 1).await.unwrap());
        assert_eq!(achievement.progress.get(), 2);
        assert!(achievement.date_unlocked.is_none());
        // A win with 5 players in game 5 would not add to the streak with 3 players either.
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state directly"
        )]
        sqlx::raw_sql(
            "UPDATE games SET score=25 WHERE id=8;
            UPDATE games SET num_players=5 WHERE id=5;",
        )
        .execute(pool)
        .await
        .unwrap();
        let achievement = streak(&achievements_of(&mut connection, 1).await.unwrap());
        assert_eq!(achievement.progress.get(), 4);
        assert!(achievement.date_unlocked.is_none());
        assert_both_ways_agree(&mut connection).await;
        drop(connection);
        db.close().await;
    }
}
