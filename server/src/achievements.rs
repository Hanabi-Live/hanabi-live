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
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Variant {
    NoVariant,
    /// The 5-suit variant of a suit, such as "Pink (5 Suits)". Games with 6 suits take too long to
    /// count.
    FiveSuits(&'static str),
}

impl Variant {
    fn name(self) -> String {
        match self {
            Self::NoVariant => DEFAULT_VARIANT_NAME.to_owned(),
            Self::FiveSuits(suit) => format!("{suit} (5 Suits)"),
        }
    }
}

/// The games whose wins count toward an achievement.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Games {
    Variant(Variant),
    /// The games of every variant with this many players.
    Players(u8),
}

impl Games {
    fn description(self) -> String {
        match self {
            Self::Variant(variant) => format!("games of {}", variant.name()),
            Self::Players(players) => format!("games with {players} players"),
        }
    }
}

/// What an achievement asks for.
pub(crate) enum Rule {
    /// A number of wins.
    Wins { games: Games, goal: i64 },
    /// One win in the 5-suit variant of each suit, such as each dark suit.
    OneWinEach {
        /// What the suits are, such as "dark suit".
        kind: &'static str,
        suits: &'static [&'static str],
    },
}

impl Rule {
    /// The games whose wins the rule counts. `OneWinEach` needs a win in each of them.
    fn games(&self) -> Vec<Games> {
        match self {
            Self::Wins { games, .. } => vec![*games],
            Self::OneWinEach { suits, .. } => suits
                .iter()
                .map(|&suit| Games::Variant(Variant::FiveSuits(suit)))
                .collect(),
        }
    }

    /// The wins in each of the rule's games that the rule needs.
    const fn wins_per_variant(&self) -> i64 {
        match self {
            Self::Wins { goal, .. } => *goal,
            Self::OneWinEach { .. } => 1,
        }
    }

    fn description(&self) -> String {
        match self {
            Self::Wins { games, goal } => {
                format!("Get the max score in {goal} {}.", games.description())
            }
            Self::OneWinEach { kind, suits } => format!(
                "Get the max score in a 5-suit game with each {kind}: {}",
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

/// An achievement for `WINS` wins in the 5-suit variant of a special suit.
const fn special_suit(id: AchievementId, name: &'static str, suit: &'static str) -> Definition {
    Definition {
        id,
        name,
        rule: Rule::Wins {
            games: Games::Variant(Variant::FiveSuits(suit)),
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

/// Every achievement, in the order that a profile shows them.
pub(crate) const ACHIEVEMENTS: &[Definition] = &[
    Definition {
        id: AchievementId::NoVariant10Wins,
        name: "I've Got the Hang of This",
        rule: Rule::Wins {
            games: Games::Variant(Variant::NoVariant),
            goal: WINS,
        },
    },
    Definition {
        id: AchievementId::NoVariant100Wins,
        name: "Core Mastery",
        rule: Rule::Wins {
            games: Games::Variant(Variant::NoVariant),
            goal: 100,
        },
    },
    special_suit(AchievementId::Rainbow10Wins, "Rainbow Wrangler", "Rainbow"),
    special_suit(AchievementId::Pink10Wins, "Tickled Pink", "Pink"),
    special_suit(AchievementId::White10Wins, "Whiteout", "White"),
    special_suit(AchievementId::Brown10Wins, "Brown Belt", "Brown"),
    special_suit(AchievementId::Omni10Wins, "Omnipotent", "Omni"),
    special_suit(AchievementId::Null10Wins, "Null and Void", "Null"),
    special_suit(
        AchievementId::MuddyRainbow10Wins,
        "Stuck in the Mud",
        "Muddy Rainbow",
    ),
    special_suit(AchievementId::LightPink10Wins, "Light Touch", "Light Pink"),
    special_suit(AchievementId::Prism10Wins, "Prismatic", "Prism"),
    Definition {
        id: AchievementId::DarkSuitsWins,
        name: "Lights Out",
        // Dark Orange is left out, as Orange is left out of the special suit achievements.
        rule: Rule::OneWinEach {
            kind: "dark suit",
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
            ],
        },
    },
    players(AchievementId::ThreePlayers10Wins, "Power Trio", 3),
    players(AchievementId::FourPlayers10Wins, "Four-Part Harmony", 4),
    players(AchievementId::FivePlayers10Wins, "High Five", 5),
];

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
        let (variants, players): (Vec<_>, _) = match games {
            Games::Variant(variant) => {
                let name = variant.name();
                let variant = hanabi_engine::variants()
                    .iter()
                    .find(|v| v.name == name)
                    .with_context(|| format!("The catalog has no variant named: {name}"))?;
                (vec![variant], 0)
            }
            Games::Players(players) => (
                hanabi_engine::variants().iter().collect(),
                i16::from(players),
            ),
        };
        for variant in variants {
            self.variant_ids.push(i16::try_from(variant.id)?);
            self.max_scores.push(i16::try_from(variant.max_score)?);
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

/// Each player's wins, by row.
type Wins = HashMap<i32, HashMap<i64, VariantWins>>;

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
fn collect(found: impl Iterator<Item = (i32, i64, i64, i64, OffsetDateTime)>) -> Wins {
    let mut wins = Wins::new();
    for (user, row, count, n, time) in found {
        let variant = wins.entry(user).or_default().entry(row).or_default();
        variant.count = count;
        variant.times.insert(n, time);
    }
    wins
}

/// The wins of the players in `users`. The query starts from each player's games.
async fn wins_of(connection: &mut PgConnection, rows: &QueryRows, users: &[i32]) -> Result<Wins> {
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
    let found = sqlx::query!(
        "SELECT x.user_id AS \"user_id!\",x.row AS \"row!\",x.wins AS \"wins!\",x.n AS \"n!\",
           x.datetime_finished AS \"datetime_finished!\"
         FROM (
           SELECT p.user_id,v.row,g.datetime_finished,
             row_number() OVER (PARTITION BY p.user_id,v.row ORDER BY g.datetime_finished,g.id)
               AS n,
             count(*) OVER (PARTITION BY p.user_id,v.row) AS wins
           FROM game_participants p JOIN games g ON g.id=p.game_id
           JOIN unnest($2::smallint[],$3::smallint[],$4::smallint[],$5::bigint[])
             AS v(variant_id,max_score,num_players,row)
             ON v.variant_id=g.variant_id AND v.max_score=g.score
             AND (v.num_players=0 OR v.num_players=g.num_players)
           WHERE p.user_id=ANY($1) AND g.end_condition=$6 AND g.num_players>=$7
           AND NOT (g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card
             OR g.all_or_nothing OR g.detrimental_characters)
         ) x JOIN unnest($8::bigint[],$9::bigint[]) AS t(row,n) ON t.row=x.row AND t.n=x.n",
        users,
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
    Ok(collect(found.into_iter().map(|row| {
        (row.user_id, row.row, row.wins, row.n, row.datetime_finished)
    })))
}

/// The wins of every player. The query starts from the games that the achievements count, which is
/// faster than starting from each player's games.
async fn all_wins(connection: &mut PgConnection, rows: &QueryRows) -> Result<Wins> {
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
    Ok(collect(found.into_iter().map(|row| {
        (row.user_id, row.row, row.wins, row.n, row.datetime_finished)
    })))
}

/// A player's progress toward an achievement.
struct Standing {
    progress: i64,
    goal: i64,
    unlocked: Option<OffsetDateTime>,
}

fn progress(
    achievement: &Definition,
    rows: &QueryRows,
    wins: Option<&HashMap<i64, VariantWins>>,
) -> Standing {
    let of = |games: Games| {
        rows.row(games)
            .and_then(|row| wins.and_then(|wins| wins.get(&row)))
    };
    match achievement.rule {
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

/// A player's progress toward each achievement, and how many players have each one.
pub(crate) async fn achievements(
    connection: &mut PgConnection,
    user: i32,
) -> Result<Vec<Achievement>> {
    let rows = QueryRows::new()?;
    let wins = wins_of(connection, &rows, &[user]).await?;
    let rarities = rarities(connection).await?;
    ACHIEVEMENTS
        .iter()
        .map(|achievement| {
            let Standing {
                progress,
                goal,
                unlocked,
            } = progress(achievement, &rows, wins.get(&user));
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

/// Replaces the unlocked achievements of the players in `wins`, or of every player when `users` is
/// `None`.
async fn write(
    connection: &mut PgConnection,
    rows: &QueryRows,
    users: Option<&[i32]>,
    wins: &Wins,
) -> Result<()> {
    let (mut ids, mut achievements, mut times) = (Vec::new(), Vec::new(), Vec::new());
    for (&user, user_wins) in wins {
        for achievement in ACHIEVEMENTS {
            if let Some(time) = progress(achievement, rows, Some(user_wins)).unlocked {
                ids.push(user);
                achievements.push(achievement.id.name());
                times.push(time);
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
    Ok(())
}

/// Writes the unlocked achievements of the players in `users`, after they finished a game.
pub(crate) async fn refresh(pool: &PgPool, users: &[i32]) -> Result<()> {
    let rows = QueryRows::new()?;
    let mut transaction = pool.begin().await?;
    // The lock keeps a refresh and the startup sync from writing a player's unlocks from older
    // wins after the other one wrote newer ones.
    advisory_lock(&mut transaction, LockSpace::Achievements, 0).await?;
    let wins = wins_of(&mut transaction, &rows, users).await?;
    write(&mut transaction, &rows, Some(users), &wins).await?;
    transaction.commit().await?;
    Ok(())
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
    let wins = all_wins(&mut transaction, &rows).await?;
    write(&mut transaction, &rows, None, &wins).await?;
    transaction.commit().await?;
    tracing::info!(
        "Wrote the achievements of {} players in {:?}.",
        wins.len(),
        started.elapsed()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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

    /// Each unlocked achievement, as the table stores it.
    async fn unlocked(pool: &PgPool) -> Vec<(i32, String)> {
        sqlx::query!(
            "SELECT user_id,achievement FROM user_achievements ORDER BY user_id,achievement"
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
        let alice = achievements(&mut connection, 1).await.unwrap();
        assert_eq!(
            alice[0].date_unlocked.as_ref().unwrap().as_str(),
            "2026-01-11T01:00:00.000Z"
        );
        assert!((alice[0].unlocked_percentage - 100.0).abs() < f64::EPSILON);
        assert!(alice[1].unlocked_percentage.abs() < f64::EPSILON);
        // Bob wins 5 more games with Alice. After the games, both of them have the achievement,
        // and Alice has 15 wins.
        win(pool, 11, 5, &[2, 1, 7]).await;
        refresh(pool, &[2, 1, 7]).await.unwrap();
        assert_eq!(
            unlocked(pool).await,
            [
                (1, first.clone()),
                (1, three.clone()),
                (2, first),
                (2, three)
            ]
        );
        let bob = achievements(&mut connection, 2).await.unwrap();
        assert_eq!(bob[0].progress.get(), WINS);
        assert_eq!(bob[1].progress.get(), WINS);
        assert!((bob[0].unlocked_percentage - 100.0).abs() < f64::EPSILON);
        drop(connection);
        db.close().await;
    }
}
