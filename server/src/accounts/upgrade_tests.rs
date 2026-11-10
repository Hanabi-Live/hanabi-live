use super::*;
use argon2::{Argon2, Params, PasswordHash, PasswordHasher};

// Synthetic one-pass password hash for verifying cost upgrades.
const OLD_HASH: &str = "$argon2id$v=19$m=65536,t=1,p=2$HSb5x/B2rWrD/KfnvZ6g/Q$4I9HT3Tlhv7K5qAbHhfODmW0d8aL4tmlfkw4dOOsX2s";
const PASSWORD: &str = "compatibility-password";

#[tokio::test]
async fn successful_old_argon_login_upgrades_once_and_preserves_stronger_hashes_postgres() {
    let Some(db) = test_support::TestDb::create().await else {
        return;
    };
    let id = db.user("Upgrade").await;
    sqlx::query!(
        "UPDATE users SET password_hash=$2 WHERE id=$1",
        id,
        OLD_HASH
    )
    .execute(&db.pool)
    .await
    .unwrap();
    let app = router(db.pool.clone(), tests::config());
    let login = |password: &str| {
        format!("username=Upgrade&password={password}&version=42&createAccount=true")
    };
    assert_eq!(
        tests::request(&app, "POST", "/login", &login("wrong"), None, false)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let stored = || {
        sqlx::query_scalar!(
            "SELECT password_hash AS \"password_hash!\" FROM users WHERE id=$1",
            id
        )
        .fetch_one(&db.pool)
    };
    assert_eq!(stored().await.unwrap(), OLD_HASH);
    assert_eq!(
        tests::request(&app, "POST", "/login", &login(PASSWORD), None, false)
            .await
            .0,
        StatusCode::OK
    );
    let upgraded = stored().await.unwrap();
    let parsed = PasswordHash::new(&upgraded).unwrap();
    let params = Params::try_from(&parsed).unwrap();
    assert_eq!(
        (params.m_cost(), params.t_cost(), params.p_cost()),
        (65536, 3, 4)
    );
    assert!(
        verify_password("127.0.0.1", PASSWORD.into(), upgraded.clone())
            .await
            .unwrap()
    );
    assert_eq!(
        tests::request(&app, "POST", "/login", &login(PASSWORD), None, false)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(stored().await.unwrap(), upgraded);
    let stronger = Argon2::new(
        argon2::Algorithm::Argon2id,
        argon2::Version::V0x13,
        Params::new(65536, 4, 4, Some(32)).unwrap(),
    )
    .hash_password_with_salt(PASSWORD.as_bytes(), b"synthetic-salt12")
    .unwrap()
    .to_string();
    sqlx::query!(
        "UPDATE users SET password_hash=$2 WHERE id=$1",
        id,
        &stronger
    )
    .execute(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        tests::request(&app, "POST", "/login", &login(PASSWORD), None, false)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(stored().await.unwrap(), stronger);
    db.close().await;
}

#[tokio::test]
async fn password_upgrade_cas_does_not_overwrite_new_credentials_postgres() {
    let Some(db) = test_support::TestDb::create().await else {
        return;
    };
    let id = db.user("Upgrade").await;
    sqlx::query!(
        "UPDATE users SET password_hash=$2 WHERE id=$1",
        id,
        OLD_HASH
    )
    .execute(&db.pool)
    .await
    .unwrap();
    let next = hash_password("127.0.0.1", "new-password".into())
        .await
        .unwrap();
    let upgrade = hash_password("127.0.0.1", PASSWORD.into()).await.unwrap();
    assert!(
        update_password_if_unchanged(&db.pool, id, &next, OLD_HASH)
            .await
            .unwrap()
    );
    assert!(
        !update_password_if_unchanged(&db.pool, id, &upgrade, OLD_HASH)
            .await
            .unwrap()
    );
    let stored: String = sqlx::query_scalar!(
        "SELECT password_hash AS \"password_hash!\" FROM users WHERE id=$1",
        id
    )
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(stored, next);
    assert!(
        verify_password("127.0.0.1", "new-password".into(), stored)
            .await
            .unwrap()
    );
    db.close().await;
}
