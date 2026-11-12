use super::*;
use crate::accounts::test_support::TestDb;
use anyhow::{Context, ensure};
use std::time::Duration;

#[tokio::test]
async fn archive_reads_use_one_fresh_snapshot_across_concurrent_edits_postgres() -> Result<()> {
    let Some(db) = TestDb::create().await else {
        return Ok(());
    };
    let alice = db.user("Alice").await;
    let bob = db.user("Bob").await;
    let result = async {
        sqlx::query!("INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,
             deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,
             seed,score,num_turns,end_condition,datetime_started,datetime_finished)
             VALUES(1,'Archive snapshot',2,0,false,NULL,NULL,false,false,false,false,false,false,false,
             'p2v0s1',0,1,4,NOW(),NOW())").execute(&db.pool).await?;
        sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat)
             VALUES(1,$1,0),(1,$2,1)", alice, bob).execute(&db.pool).await?;
        sqlx::query!("INSERT INTO game_participant_notes(game_participant_id,card_order,note)
             SELECT id,0,'before-note' FROM game_participants WHERE game_id=1 AND seat=0").execute(&db.pool).await?;
        sqlx::query!("INSERT INTO game_tags(game_id,user_id,tag) VALUES(1,$1,'before-tag')", alice).execute(&db.pool).await?;
        sqlx::query!("INSERT INTO game_actions(game_id,turn,type,target,value) VALUES(1,0,4,0,4)")
            .execute(&db.pool).await?;

        let initial = load(&db.pool, GameId::new(1).unwrap()).await?.context("Missing initial archive")?;
        ensure!(initial.players.len() == 2 && initial.players[0].user_id == alice
            && initial.players[1].user_id == bob, "Participant order changed");
        ensure!(initial.actions.len() == 1 && initial.notes[0].note == "before-note"
            && initial.tags[0].tag == "before-tag", "Archive components missing");
        ensure!(load(&db.pool, GameId::new(999).unwrap()).await?.is_none(), "Missing game looked present");
#[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]

        sqlx::raw_sql(
            "ALTER TABLE games RENAME TO archive_games;
             CREATE FUNCTION archive_read_gate(identifier integer) RETURNS boolean
             LANGUAGE plpgsql VOLATILE AS $$ BEGIN
               PERFORM pg_advisory_xact_lock(17893,identifier); RETURN true;
             END $$;
             CREATE VIEW games AS SELECT g.* FROM archive_games g WHERE archive_read_gate(g.id)",
        ).execute(&db.pool).await?;
        let mut guard = db.pool.begin().await?;
        sqlx::query!("SELECT pg_advisory_xact_lock(17893,1)").execute(&mut *guard).await?;
        let pool = db.pool.clone();
        let reader = tokio::spawn(async move { load(&pool, GameId::new(1).unwrap()).await });
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let blocked: bool = sqlx::query_scalar!("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory'
                     AND classid=17893::oid AND objid=1::oid AND NOT granted
                     AND database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS \"v!\"").fetch_one(&db.pool).await?;
                if blocked { break; }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Ok::<(),anyhow::Error>(())
        }).await??;
        let mut editing = db.pool.begin().await?;
        sqlx::query!("UPDATE game_participant_notes SET note='after-note'")
            .execute(&mut *editing).await?;
        sqlx::query!("UPDATE game_tags SET tag='after-tag'").execute(&mut *editing).await?;
        editing.commit().await?;
        guard.rollback().await?;
        let snapshot = reader.await??.context("Blocked archive disappeared")?;
        ensure!(snapshot.notes[0].note == "before-note" && snapshot.tags[0].tag == "before-tag",
            "A replay combined components from different database snapshots");
        let fresh = load(&db.pool, GameId::new(1).unwrap()).await?.context("Updated archive disappeared")?;
        ensure!(fresh.notes[0].note == "after-note" && fresh.tags[0].tag == "after-tag",
            "Replay reads cached mutable metadata");
        Ok(())
    }.await;
    db.close().await;
    result
}
