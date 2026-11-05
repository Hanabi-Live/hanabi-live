use super::*;

#[tokio::test]
async fn drains_notify_all_tables_before_waiting_for_acknowledgements() -> Result<()> {
    let redis = crate::test_redis::RedisFixture::start(true).await?;
    for successful in [true, false] {
        let state =
            crate::state::RedisState::connect(&redis.url, &format!("lifecycle-{successful}"))
                .await?;
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://unused@127.0.0.1/unused")?;
        let store = crate::store::Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let (table_sender, mut table_commands) = mpsc::channel(4);
        let (second_sender, mut second_commands) = mpsc::channel(4);
        let (second_frozen, first_checkpoint_can_finish) = oneshot::channel();
        let (closed_sender, closed_receiver) = mpsc::channel(4);
        drop(closed_receiver);
        tasks.spawn(async move {
            if let Some(TableCommand::Drain(reply)) = table_commands.recv().await {
                // A slow checkpoint must not postpone another table's freeze notification.
                first_checkpoint_can_finish.await.unwrap();
                let _ = reply.send(if successful {
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("First durable checkpoint failure"))
                });
            }
        });
        tasks.spawn(async move {
            if let Some(TableCommand::Drain(reply)) = second_commands.recv().await {
                let _ = second_frozen.send(());
                let _ = reply.send(if successful {
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("Second durable checkpoint failure"))
                });
            }
        });
        let (hub, mut commands) = mpsc::channel(4);
        let notices = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let seen = notices.clone();
        tasks.spawn(async move {
            while let Some(command) = commands.recv().await {
                match command {
                    HubCommand::Quiesce(reply) => {
                        let mut handles = vec![
                            crate::actors::TableHandle {
                                sender: table_sender.clone(),
                                cleanup: Arc::new(tokio::sync::Notify::new()),
                            },
                            crate::actors::TableHandle {
                                sender: second_sender.clone(),
                                cleanup: Arc::new(tokio::sync::Notify::new()),
                            },
                        ];
                        if !successful {
                            handles.push(crate::actors::TableHandle {
                                sender: closed_sender.clone(),
                                cleanup: Arc::new(tokio::sync::Notify::new()),
                            });
                        }
                        let _ = reply.send(handles);
                    }
                    HubCommand::Operations {
                        command: Operation::Drained,
                        reply,
                    } => {
                        seen.fetch_add(1, Ordering::Relaxed);
                        let _ = reply.send(Ok(json!({})));
                    }
                    HubCommand::Stop(reply) => {
                        let _ = reply.send(());
                        break;
                    }
                    _ => {}
                }
            }
        });
        let app = App::new(
            store.clone(),
            hub,
            crate::public_http::PublicConfig {
                root: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."),
                session_secret: "test".repeat(32).into(),
                domain: "localhost".into(),
                use_tls: false,
                client_version: "1".into(),
                is_dev: true,
                seeded_deck: crate::game::seeded_deck,
                deck_size: crate::game::deck_size,
            },
            store.state_lost(),
        );
        let result = tokio::time::timeout(
            Duration::from_secs(3),
            drain_game_runtime(&app, &tasks, true),
        )
        .await?;
        assert_eq!(result.is_ok(), successful);
        if !successful {
            let error = format!("{:#}", result.unwrap_err());
            assert!(
                error.contains("First durable checkpoint failure"),
                "{error}"
            );
            assert!(
                error.contains("Second durable checkpoint failure"),
                "{error}"
            );
            assert!(
                error.contains("Table stopped before its drain was acknowledged"),
                "{error}"
            );
        }
        assert_eq!(notices.load(Ordering::Relaxed), u64::from(successful));
        assert!(tasks.is_empty());
        app.shutdown.cancel();
        store.close().await?;
    }
    Ok(())
}

#[tokio::test]
async fn scheduled_shutdown_warns_clears_terminates_and_stops_after_empty_grace() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    let mut h = crate::operations_tests::Harness::new(pool);
    h.control.schedule().await.unwrap();
    {
        let mut scheduled = h.control.schedule.lock().unwrap();
        scheduled.as_mut().unwrap().deadline = Instant::now() - Duration::from_secs(1);
    }
    h.control.tick().await.unwrap();
    assert!(
        h.operations
            .lock()
            .unwrap()
            .iter()
            .any(|o| matches!(o, Operation::ClearPregames))
    );
    assert!(
        h.operations
            .lock()
            .unwrap()
            .iter()
            .any(|o| matches!(o, Operation::TerminateGames))
    );
    h.active.store(0, Ordering::Release);
    h.control
        .schedule
        .lock()
        .unwrap()
        .as_mut()
        .unwrap()
        .empty_since = Some(Instant::now() - Duration::from_secs(11));
    h.control.tick().await.unwrap();
    assert!(matches!(h.stops.recv().await, Some(StopReason::Shutdown)));
    h.close().await;
}

#[tokio::test]
async fn orderly_drain_waits_for_admitted_operations() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    let h = crate::operations_tests::Harness::new(pool);
    let admitted = h.control.admission.clone().read_owned().await;
    let control = h.control.clone();
    let mut drain = tokio::spawn(async move { control.begin_drain().await });
    assert!(
        tokio::time::timeout(Duration::from_millis(20), &mut drain)
            .await
            .is_err()
    );
    assert!(!h.control.accepting.load(Ordering::Acquire));
    drop(admitted);
    tokio::time::timeout(Duration::from_secs(2), drain)
        .await
        .unwrap()
        .unwrap();
    h.close().await;
}
