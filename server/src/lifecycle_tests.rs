use super::*;
use std::time::Duration;

#[tokio::test]
async fn drains_notify_all_tables_before_waiting_for_acknowledgements() -> Result<()> {
    for (successful, reason) in [
        (true, StopReason::Restart(Some("Upgrading <db>".into()))),
        (false, StopReason::Restart(None)),
        (
            true,
            StopReason::GracefulStop(Some("Upgrading <db>".into())),
        ),
        (false, StopReason::GracefulStop(None)),
    ] {
        let restart = matches!(reason, StopReason::Restart(_));
        let Some(db) = crate::accounts::test_support::TestDb::create().await else {
            return Ok(());
        };
        let state = crate::state::LiveState::for_test(&db.pool).await?;
        let store = Store::fixture(db.pool.clone(), state);
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
                    HubCommand::Drained {
                        reconnect,
                        message,
                        reply,
                    } => {
                        // Users see the administrator's reason as escaped HTML.
                        assert!(reconnect);
                        let expected = if restart {
                            "The server is restarting and will be back shortly.<br />Reason: Upgrading &lt;db&gt;"
                        } else {
                            "The server is going down for maintenance. Your accepted game progress has been saved.<br />Reason: Upgrading &lt;db&gt;"
                        };
                        assert_eq!(message.as_deref(), successful.then_some(expected));
                        seen.fetch_add(1, Ordering::Relaxed);
                        let _ = reply.send(Ok(()));
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
            },
            Lifecycle::new(store.ownership_lost()),
            crate::server_info::test_info(),
            IntegrationSlot::default(),
        );
        let result = tokio::time::timeout(
            Duration::from_secs(3),
            drain_game_runtime(&app, &tasks, &reason),
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
        app.lifecycle.shutdown.cancel();
        store.close().await?;
        db.close().await;
    }
    Ok(())
}

#[tokio::test]
async fn orderly_drain_waits_for_admitted_operations() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    let h = crate::operations_tests::Harness::new(pool);
    let admitted = h.control.lifecycle.admit_operation().await.unwrap();
    let control = h.control.clone();
    let mut drain = tokio::spawn(async move { control.lifecycle.drain().await });
    assert!(
        tokio::time::timeout(Duration::from_millis(20), &mut drain)
            .await
            .is_err()
    );
    assert!(!h.control.lifecycle.accepting());
    drop(admitted);
    tokio::time::timeout(Duration::from_secs(2), drain)
        .await
        .unwrap()
        .unwrap();
    h.close().await;
}

#[tokio::test]
async fn graceful_stop_does_not_wait_for_or_terminate_games() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    let mut h = crate::operations_tests::Harness::new(pool);
    h.control.graceful_stop(None).await.unwrap();
    assert!(matches!(
        h.stops.recv().await,
        Some(StopReason::GracefulStop(None))
    ));
    assert!(h.control.lifecycle.draining());
    assert!(h.operations.lock().unwrap().is_empty());
    assert!(h.control.graceful_stop(None).await.is_err());
    h.close().await;
}
