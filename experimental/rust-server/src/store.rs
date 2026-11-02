use crate::{
    game::{Action, Game, decode_deck, encode_deck, standard_deck},
    model::{FORMAT, Player, Snapshot},
};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{
    PgPool, Postgres, Row, Transaction,
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use tokio_util::task::TaskTracker;

#[derive(Clone)]
pub struct Store {
    pub primary: PgPool,
    recovery: PgPool,
    stats: TaskTracker,
    stats_slots: Arc<Semaphore>,
}

impl Store {
    #[cfg(test)]
    pub(crate) fn disconnected_fixture() -> Self {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://unused@127.0.0.1/unused")
            .expect("fixed fixture URL");
        Self {
            primary: pool.clone(),
            recovery: pool,
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(32)),
        }
    }

    pub async fn connect(config: &crate::config::Config) -> Result<Self> {
        let options = PgConnectOptions::new()
            .host(&config.database_host)
            .port(config.database_port)
            .username(&config.database_user)
            .password(&config.database_password)
            .database(&config.database)
            .ssl_mode(PgSslMode::Disable);
        async fn pool(options: PgConnectOptions, max: u32) -> Result<PgPool> {
            Ok(PgPoolOptions::new()
                .max_connections(max)
                .acquire_timeout(Duration::from_secs(30))
                .after_connect(|connection, _| {
                    Box::pin(async move {
                        sqlx::query("SET statement_timeout = 30000")
                            .execute(&mut *connection)
                            .await?;
                        sqlx::query("SET idle_in_transaction_session_timeout = 30000")
                            .execute(connection)
                            .await?;
                        Ok(())
                    })
                })
                .connect_with(options)
                .await?)
        }
        let primary = pool(
            options.clone().application_name("hanabi-rust-poc-primary"),
            10,
        )
        .await?;
        let recovery = pool(options.application_name("hanabi-rust-poc-recovery"), 2).await?;
        let version: i32 = sqlx::query_scalar("SELECT version FROM schema_version")
            .fetch_one(&primary)
            .await?;
        ensure!(version == 5, "Rust PoC expects schema version 5");
        Ok(Self {
            primary,
            recovery,
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(32)),
        })
    }

    pub async fn reserve(&self) -> Result<i32> {
        let id: i64 = sqlx::query_scalar("SELECT nextval(pg_get_serial_sequence('games','id'))")
            .fetch_one(&self.recovery)
            .await?;
        Ok(i32::try_from(id)?)
    }

    async fn lock(tx: &mut Transaction<'_, Postgres>, id: i32) -> Result<()> {
        sqlx::query("SELECT pg_advisory_xact_lock(17482, $1)")
            .bind(id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    pub async fn save(&self, snapshot: &Snapshot, expected: i64) -> Result<i64> {
        let encoded = serde_json::to_string(snapshot)?;
        ensure!(encoded.len() <= 4 * 1024 * 1024, "Checkpoint too large");
        let mut tx = self.recovery.begin().await?;
        Self::lock(&mut tx, snapshot.game_id).await?;
        let completed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM games WHERE id=$1)")
            .bind(snapshot.game_id)
            .fetch_one(&mut *tx)
            .await?;
        ensure!(!completed, "Completed game cannot be resurrected");
        let revision: Option<i64> = if expected == 0 {
            sqlx::query_scalar(
                "INSERT INTO active_games(game_id, revision, checkpoint)
             SELECT $1, 1, $2 WHERE $3::bigint = 0
             ON CONFLICT(game_id) DO NOTHING RETURNING revision",
            )
            .bind(snapshot.game_id)
            .bind(&encoded)
            .bind(expected)
            .fetch_optional(&mut *tx)
            .await?
        } else {
            sqlx::query_scalar("UPDATE active_games SET revision=revision+1, checkpoint=$2 WHERE game_id=$1 AND revision=$3 RETURNING revision")
                .bind(snapshot.game_id).bind(&encoded).bind(expected).fetch_optional(&mut *tx).await?
        };
        let revision = revision.context("Stale checkpoint revision")?;
        tx.commit().await?;
        Ok(revision)
    }

    pub async fn load(&self) -> Result<Vec<(Snapshot, i64)>> {
        let rows = sqlx::query(
            "SELECT game_id, revision, checkpoint FROM active_games ORDER BY game_id LIMIT 257",
        )
        .fetch_all(&self.recovery)
        .await?;
        ensure!(
            rows.len() <= 256,
            "Too many active games for the bounded Rust PoC"
        );
        let mut loaded = Vec::new();
        for row in rows {
            let raw: String = row.try_get("checkpoint")?;
            ensure!(raw.len() <= 4 * 1024 * 1024, "Oversized stored checkpoint");
            let snapshot: Snapshot = serde_json::from_str(&raw)?;
            snapshot.validate()?;
            let id: i32 = row.try_get("game_id")?;
            let revision: i64 = row.try_get("revision")?;
            ensure!(
                id == snapshot.game_id && revision > 0,
                "Invalid checkpoint envelope"
            );
            if snapshot.game.end == 0 {
                loaded.push((snapshot, revision));
            } else {
                self.complete(&snapshot, revision).await?;
                self.refresh_background(snapshot);
            }
        }
        Ok(loaded)
    }

    pub async fn complete(
        &self,
        s: &Snapshot,
        revision: i64,
    ) -> Result<(DateTime<Utc>, DateTime<Utc>)> {
        ensure!(s.game.end != 0, "Cannot complete an ongoing game");
        let finished = s.finished.context("Missing completion time")?;
        let mut tx = self.recovery.begin().await?;
        Self::lock(&mut tx, s.game_id).await?;
        let existing = sqlx::query("SELECT * FROM games WHERE id=$1")
            .bind(s.game_id)
            .fetch_optional(&mut *tx)
            .await?;
        let times = if let Some(row) = existing {
            validate_standard_record(&row)?;
            ensure!(
                row.try_get::<String, _>("name")? == s.name,
                "Conflicting game name"
            );
            ensure!(
                row.try_get::<String, _>("seed")? == s.seed
                    && row.try_get::<i16, _>("score")? == i16::from(s.game.score)
                    && row.try_get::<i16, _>("num_turns")? == s.game.turn as i16
                    && row.try_get::<i16, _>("end_condition")? == i16::from(s.game.end),
                "Conflicting completion"
            );
            let players: Vec<i32> = sqlx::query_scalar(
                "SELECT user_id FROM game_participants WHERE game_id=$1 ORDER BY seat",
            )
            .bind(s.game_id)
            .fetch_all(&mut *tx)
            .await?;
            ensure!(
                players == s.players.iter().map(|p| p.id).collect::<Vec<_>>(),
                "Conflicting participants"
            );
            let actions = sqlx::query(
                "SELECT type, target, value FROM game_actions WHERE game_id=$1 ORDER BY turn",
            )
            .bind(s.game_id)
            .fetch_all(&mut *tx)
            .await?;
            ensure!(actions.len() == s.game.actions.len(), "Conflicting actions");
            for (row, action) in actions.iter().zip(&s.game.actions) {
                ensure!(
                    row.try_get::<i16, _>("type")? == i16::from(action.kind)
                        && row.try_get::<i16, _>("target")? == action.target as i16
                        && row.try_get::<i16, _>("value")? == action.value as i16,
                    "Conflicting action identity"
                );
            }
            let custom: Option<Vec<u8>> =
                sqlx::query_scalar("SELECT deck FROM game_custom_decks WHERE game_id=$1")
                    .bind(s.game_id)
                    .fetch_optional(&mut *tx)
                    .await?;
            let actual = match custom {
                Some(bytes) => decode_deck(&bytes)?,
                None => standard_deck(&s.seed)?,
            };
            ensure!(actual == s.game.deck, "Conflicting completed deck");
            (
                row.try_get("datetime_started")?,
                row.try_get("datetime_finished")?,
            )
        } else {
            let current: Option<i64> =
                sqlx::query_scalar("SELECT revision FROM active_games WHERE game_id=$1")
                    .bind(s.game_id)
                    .fetch_optional(&mut *tx)
                    .await?;
            ensure!(
                current == Some(revision),
                "Completion requires the current checkpoint"
            );
            sqlx::query("INSERT INTO games(id,name,num_players,starting_player,variant_id,timed,time_base,time_per_turn,
                speedrun,card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,
                seed,score,num_turns,end_condition,datetime_started,datetime_finished)
                VALUES($1,$2,2,0,0,false,0,0,false,false,false,false,false,false,false,false,$3,$4,$5,$6,$7,$8)")
                .bind(s.game_id).bind(&s.name).bind(&s.seed).bind(i16::from(s.game.score))
                .bind(s.game.turn as i16).bind(i16::from(s.game.end)).bind(s.started).bind(finished).execute(&mut *tx).await?;
            for (seat, player) in s.players.iter().enumerate() {
                sqlx::query("INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata) VALUES($1,$2,$3,-1,0)")
                    .bind(s.game_id).bind(player.id).bind(seat as i16).execute(&mut *tx).await?;
            }
            let kinds: Vec<i16> = s.game.actions.iter().map(|a| i16::from(a.kind)).collect();
            let targets: Vec<i16> = s.game.actions.iter().map(|a| a.target as i16).collect();
            let values: Vec<i16> = s.game.actions.iter().map(|a| a.value as i16).collect();
            sqlx::query("INSERT INTO game_actions(game_id,turn,type,target,value)
                SELECT $1,(a.turn-1)::smallint,a.kind,a.target,a.value FROM
                UNNEST($2::smallint[],$3::smallint[],$4::smallint[]) WITH ORDINALITY AS a(kind,target,value,turn)")
                .bind(s.game_id).bind(kinds).bind(targets).bind(values).execute(&mut *tx).await?;
            if s.game.deck != standard_deck(&s.seed)? {
                sqlx::query("INSERT INTO game_custom_decks(game_id,deck) VALUES($1,$2)")
                    .bind(s.game_id)
                    .bind(encode_deck(&s.game.deck)?)
                    .execute(&mut *tx)
                    .await?;
            }
            let row =
                sqlx::query("SELECT datetime_started,datetime_finished FROM games WHERE id=$1")
                    .bind(s.game_id)
                    .fetch_one(&mut *tx)
                    .await?;
            (
                row.try_get("datetime_started")?,
                row.try_get("datetime_finished")?,
            )
        };
        sqlx::query("DELETE FROM active_games WHERE game_id=$1")
            .bind(s.game_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(times)
    }

    pub async fn historical(&self, id: i32, table_id: u64, owner: i32) -> Result<Snapshot> {
        let mut tx = self.primary.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *tx)
            .await?;
        let row = sqlx::query("SELECT * FROM games WHERE id=$1")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .context("Unknown replay")?;
        validate_standard_record(&row)?;
        let seed: String = row.try_get("seed")?;
        let custom: Option<Vec<u8>> =
            sqlx::query_scalar("SELECT deck FROM game_custom_decks WHERE game_id=$1")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        let player_rows = sqlx::query("SELECT p.user_id,p.seat,u.username FROM game_participants p JOIN users u ON u.id=p.user_id WHERE p.game_id=$1 ORDER BY p.seat")
            .bind(id).fetch_all(&mut *tx).await?;
        ensure!(player_rows.len() == 2, "Invalid replay roster");
        let mut players = Vec::new();
        for (seat, row) in player_rows.iter().enumerate() {
            ensure!(
                row.try_get::<i16, _>("seat")? == seat as i16,
                "Invalid replay seat"
            );
            players.push(Player {
                id: row.try_get("user_id")?,
                name: row.try_get("username")?,
                stats: zero_stats(),
            });
        }
        let rows = sqlx::query(
            "SELECT type,target,value FROM game_actions WHERE game_id=$1 ORDER BY turn",
        )
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;
        let mut actions = Vec::new();
        for row in rows {
            actions.push(Action {
                kind: u8::try_from(row.try_get::<i16, _>("type")?)?,
                target: i32::from(row.try_get::<i16, _>("target")?),
                value: i32::from(row.try_get::<i16, _>("value")?),
            });
        }
        // The benchmark contains no authored notes. Refuse rather than silently omit them.
        let notes: i64 = sqlx::query_scalar("SELECT count(*) FROM game_participant_notes n JOIN game_participants p ON p.id=n.game_participant_id WHERE p.game_id=$1")
            .bind(id).fetch_one(&mut *tx).await?;
        ensure!(notes == 0, "Authored notes are outside this PoC");
        tx.commit().await?;
        let deck = match custom {
            Some(deck) => decode_deck(&deck)?,
            None => standard_deck(&seed)?,
        };
        let game = Game::replay(deck, actions)?;
        ensure!(
            i16::from(game.score) == row.try_get::<i16, _>("score")?
                && i16::from(game.end) == row.try_get::<i16, _>("end_condition")?,
            "Replay result mismatch"
        );
        let players: [Player; 2] = players
            .try_into()
            .map_err(|_| anyhow::anyhow!("Invalid roster"))?;
        Ok(Snapshot {
            format: FORMAT.into(),
            table_id,
            game_id: id,
            owner,
            name: row.try_get("name")?,
            players,
            seed,
            created: Utc::now(),
            started: row.try_get("datetime_started")?,
            finished: Some(row.try_get("datetime_finished")?),
            game,
            clocks: [0, 0],
            duration: 0,
            turn_elapsed: 0,
            timer_started: false,
            receipts: Vec::new(),
        })
    }

    pub async fn player(&self, id: i32, name: String) -> Result<Player> {
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM game_participants WHERE user_id=$1")
                .bind(id)
                .fetch_one(&self.primary)
                .await?;
        let row = sqlx::query("SELECT * FROM user_stats WHERE user_id=$1 AND variant_id=0")
            .bind(id)
            .fetch_optional(&self.primary)
            .await?;
        let mut stats = zero_stats();
        stats["numGames"] = json!(count);
        if let Some(row) = row {
            stats["variant"]["numGames"] = json!(row.try_get::<i32, _>("num_games")?);
            stats["variant"]["averageScore"] = json!(row.try_get::<f64, _>("average_score")?);
            stats["variant"]["numStrikeouts"] = json!(row.try_get::<i32, _>("num_strikeouts")?);
            for count in 2..=6 {
                stats["variant"]["bestScores"][count - 2]["score"] =
                    json!(row.try_get::<i16, _>(format!("best_score{count}").as_str())?);
            }
        }
        Ok(Player { id, name, stats })
    }

    pub async fn seed_count(&self, seed: &str) -> Result<i64> {
        Ok(
            sqlx::query_scalar("SELECT count(*) FROM games WHERE seed=$1")
                .bind(seed)
                .fetch_one(&self.primary)
                .await?,
        )
    }

    pub fn refresh_background(&self, snapshot: Snapshot) {
        let Ok(permit) = self.stats_slots.clone().try_acquire_owned() else {
            eprintln!("Derived statistics capacity exhausted; core game remains committed.");
            return;
        };
        let store = self.clone();
        self.stats.spawn(async move {
            let _permit = permit;
            if let Err(error) = store.refresh(&snapshot).await {
                eprintln!("Derived statistics failed: {error}");
            }
        });
    }

    async fn refresh(&self, s: &Snapshot) -> Result<()> {
        let mut tx = self.primary.begin().await?;
        sqlx::query("INSERT INTO seeds(seed,num_games) VALUES($1,0) ON CONFLICT DO NOTHING")
            .bind(&s.seed)
            .execute(&mut *tx)
            .await?;
        sqlx::query("SELECT seed FROM seeds WHERE seed=$1 FOR UPDATE")
            .bind(&s.seed)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE seeds SET num_games=(SELECT count(*) FROM games WHERE seed=$1) WHERE seed=$1",
        )
        .bind(&s.seed)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        let mut tx = self.primary.begin().await?;
        sqlx::query("INSERT INTO variant_stats(variant_id) VALUES(0) ON CONFLICT DO NOTHING")
            .execute(&mut *tx)
            .await?;
        sqlx::query("SELECT variant_id FROM variant_stats WHERE variant_id=0 FOR UPDATE")
            .execute(&mut *tx)
            .await?;
        for player in &s.players {
            sqlx::query(
                "INSERT INTO user_stats(user_id,variant_id) VALUES($1,0) ON CONFLICT DO NOTHING",
            )
            .bind(player.id)
            .execute(&mut *tx)
            .await?;
            sqlx::query("UPDATE user_stats SET best_score2=GREATEST(best_score2,$2),best_score2_mod=0,
                num_games=s.n,average_score=s.avg,num_strikeouts=s.strikes
                FROM (SELECT count(*)::integer n,COALESCE(avg(g.score) FILTER(WHERE g.score<>0),0)::float8 avg,
                  (count(*) FILTER(WHERE g.score=0))::integer strikes
                  FROM games g JOIN game_participants p ON p.game_id=g.id WHERE p.user_id=$1 AND g.variant_id=0 AND NOT g.speedrun) s
                WHERE user_stats.user_id=$1 AND variant_id=0").bind(player.id).bind(i16::from(s.game.score)).execute(&mut *tx).await?;
        }
        sqlx::query("UPDATE variant_stats SET best_score2=GREATEST(best_score2,$1),num_games=s.n,
            num_max_scores=s.maximum,average_score=s.avg,num_strikeouts=s.strikes
            FROM (SELECT count(*)::integer n,(count(*) FILTER(WHERE score=25))::integer maximum,
              COALESCE(avg(score) FILTER(WHERE score<>0),0)::float8 avg,(count(*) FILTER(WHERE score=0))::integer strikes
              FROM games WHERE variant_id=0 AND NOT speedrun) s WHERE variant_id=0")
            .bind(i16::from(s.game.score)).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn close(&self) {
        self.stats.close();
        self.stats.wait().await;
        self.recovery.close().await;
        self.primary.close().await;
    }
}

pub fn zero_stats() -> Value {
    json!({"numGames":0,"variant":{"numGames":0,"averageScore":0,"numStrikeouts":0,
        "bestScores":(2..=6).map(|count| json!({"numPlayers":count,"score":0,"modifier":0,
            "deckPlays":false,"emptyClues":false,"oneExtraCard":false,"oneLessCard":false,"allOrNothing":false})).collect::<Vec<_>>()}})
}

pub fn validate_standard_record(row: &sqlx::postgres::PgRow) -> Result<()> {
    ensure!(
        row.try_get::<i16, _>("variant_id")? == 0
            && row.try_get::<i16, _>("num_players")? == 2
            && row.try_get::<i16, _>("starting_player")? == 0,
        "Unsupported historical variant or seats"
    );
    ensure!(
        row.try_get::<i32, _>("time_base")? == 0 && row.try_get::<i32, _>("time_per_turn")? == 0,
        "Only default untimed clock options are supported"
    );
    for flag in [
        "timed",
        "speedrun",
        "card_cycle",
        "deck_plays",
        "empty_clues",
        "one_extra_card",
        "one_less_card",
        "all_or_nothing",
        "detrimental_characters",
    ] {
        ensure!(
            !row.try_get::<bool, _>(flag)?,
            "Unsupported historical modifier: {flag}"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{Card, unshuffled_deck};
    use std::{env, str::FromStr};

    fn winning() -> Vec<Card> {
        let sequence: Vec<Card> = (0..25)
            .map(|i| Card {
                suit_index: i / 5,
                rank: i % 5 + 1,
            })
            .collect();
        let mut rest = unshuffled_deck();
        for card in &sequence {
            rest.remove(rest.iter().position(|v| v == card).unwrap());
        }
        sequence[..10]
            .iter()
            .step_by(2)
            .chain(sequence[1..10].iter().step_by(2))
            .chain(sequence[10..].iter())
            .chain(rest.iter())
            .cloned()
            .collect()
    }

    #[tokio::test]
    async fn database_cas_atomic_completion_and_no_resurrection() -> Result<()> {
        let Ok(url) = env::var("HANABI_TEST_DATABASE_URL") else {
            eprintln!("Skipping PostgreSQL case: HANABI_TEST_DATABASE_URL is not set.");
            return Ok(());
        };
        let options = PgConnectOptions::from_str(&url)?;
        ensure!(
            matches!(options.get_host(), "localhost" | "127.0.0.1")
                || options.get_host().starts_with('/'),
            "Disposable local PostgreSQL required"
        );
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await?;
        let name = format!("ts_slice_{:032x}", rand::random::<u128>());
        sqlx::query(&format!("CREATE DATABASE {name}"))
            .execute(&admin)
            .await?;
        let options = options.database(&name).options([
            ("statement_timeout", "3000"),
            ("idle_in_transaction_session_timeout", "3000"),
        ]);
        let primary = PgPoolOptions::new()
            .max_connections(2)
            .connect_with(options.clone())
            .await?;
        let recovery = PgPoolOptions::new()
            .max_connections(2)
            .connect_with(options)
            .await?;
        let store = Store {
            primary,
            recovery,
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(32)),
        };
        let result=async {
            sqlx::raw_sql(include_str!("../../../install/database_schema.sql")).execute(&store.primary).await?;
            sqlx::query("INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES(1,'Alice','alice','test','127.0.0.1'),(2,'Bob','bob','test','127.0.0.1')")
                .execute(&store.primary).await?;
            let id=store.reserve().await?;
            let now=Utc::now();
            let mut snapshot=Snapshot{
                format:FORMAT.into(),table_id:1,game_id:id,owner:1,name:"standard".into(),seed:"p2v0s1".into(),
                players:[Player{id:1,name:"Alice".into(),stats:zero_stats()},Player{id:2,name:"Bob".into(),stats:zero_stats()}],
                created:now,started:now,finished:None,game:Game::new(winning())?,
                clocks:[0,0],duration:0,turn_elapsed:0,timer_started:false,receipts:Vec::new(),
            };
            ensure!(store.save(&snapshot,0).await?==1,"First revision mismatch");
            let (left,right)=tokio::join!(store.save(&snapshot,1),store.save(&snapshot,1));
            ensure!(left.is_ok()!=right.is_ok(),"CAS admitted two writers");
            let loaded=store.load().await?;
            ensure!(loaded.len()==1 && loaded[0].1==2,"Recovery revision mismatch");
            for turn in 0..25 {
                let order=snapshot.game.deck.iter().position(|card|card.suit_index==turn/5 && card.rank==turn%5+1).context("Missing scripted card")?;
                snapshot.game.apply(snapshot.game.active,Action{kind:0,target:order as i32,value:0})?;
            }
            snapshot.finished=Some(Utc::now());
            snapshot.validate()?;
            let revision=store.save(&snapshot,2).await?;
            sqlx::query("ALTER TABLE game_actions ADD CONSTRAINT reject_test_actions CHECK(type < 0)").execute(&store.primary).await?;
            ensure!(store.complete(&snapshot,revision).await.is_err(),"Invalid completion succeeded");
            let count:i64=sqlx::query_scalar("SELECT count(*) FROM games").fetch_one(&store.primary).await?;
            ensure!(count==0,"Partial completion escaped rollback");
            let active:i64=sqlx::query_scalar("SELECT count(*) FROM active_games").fetch_one(&store.primary).await?;
            ensure!(active==1,"Rollback lost recovery checkpoint");
            sqlx::query("ALTER TABLE game_actions DROP CONSTRAINT reject_test_actions").execute(&store.primary).await?;
            ensure!(store.load().await?.is_empty(), "Terminal recovery did not finalize the game");
            let times=store.complete(&snapshot,revision).await?;
            ensure!(store.complete(&snapshot,revision).await?==times,"Retry changed committed times");
            let count:i64=sqlx::query_scalar("SELECT count(*) FROM game_actions").fetch_one(&store.primary).await?;
            ensure!(count==25,"Actions were duplicated or omitted");
            ensure!(store.save(&snapshot,0).await.is_err(),"Completed game resurrected");
            let restored=store.historical(id,2,1).await?;
            ensure!(restored.game==snapshot.game,"Historical reconstruction changed accepted game");
            snapshot.game.deck[0].rank=5;
            ensure!(store.complete(&snapshot,revision).await.is_err(),"Conflicting deck accepted on retry");
            Ok::<(),anyhow::Error>(())
        }.await;
        store.close().await;
        sqlx::query(&format!("DROP DATABASE {name} WITH (FORCE)"))
            .execute(&admin)
            .await?;
        admin.close().await;
        result
    }
}
