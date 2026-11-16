use anyhow::{Result, bail, ensure};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

pub const NAME: &str = "hanabi.sid";
/// `NAME` holds the most recent sign-in, which new tabs use; this keeps each account available to
/// the tabs that signed in to it.
pub fn account_name(id: i32) -> String {
    format!("{NAME}.{id}")
}
/// How long a session cookie stays valid, in seconds (one year).
pub const MAX_AGE: i64 = 365 * hanabi_protocol::SECONDS_PER_DAY;
/// The longest encoded cookie we decode, in bytes.
const MAX_ENCODED_LENGTH: usize = 4096;

/// The separator between the user ID, the timestamp, the session version, and the signature.
const SEPARATOR: char = '.';

/// A signed-in account. The session ends when the account's session version changes, such as when
/// its password changes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Session {
    pub id: i32,
    pub version: i32,
}

fn mac(secret: &str, message: &str) -> Result<Hmac<Sha256>> {
    ensure!(!secret.is_empty(), "Missing signing key");
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())?;
    mac.update(format!("{NAME}|").as_bytes());
    mac.update(message.as_bytes());
    Ok(mac)
}

/// Reads a cookie in the form `{id}.{timestamp}.{version}.{signature}`. Cookies signed before
/// sessions had versions have no version, and they are read as version 0.
pub fn decode(encoded: &str, secret: &str, now: i64) -> Result<Session> {
    ensure!(encoded.len() <= MAX_ENCODED_LENGTH, "Oversized cookie");
    let Some((message, signature)) = encoded.rsplit_once(SEPARATOR) else {
        bail!("Invalid cookie")
    };
    let Some((id, rest)) = message.split_once(SEPARATOR) else {
        bail!("Invalid cookie")
    };
    let (timestamp, version) = rest.split_once(SEPARATOR).unwrap_or((rest, "0"));
    // Only the server signs cookies, so the signed numbers are well formed.
    mac(secret, message)?.verify_slice(&URL_SAFE_NO_PAD.decode(signature)?)?;
    let id: i32 = id.parse()?;
    ensure!(id > 0, "Invalid user ID");
    ensure!(timestamp.parse::<i64>()? >= now - MAX_AGE, "Expired cookie");
    Ok(Session {
        id,
        version: version.parse()?,
    })
}

pub fn encode(session: Session, secret: &str, timestamp: i64) -> Result<String> {
    let Session { id, version } = session;
    ensure!(
        id > 0 && timestamp >= 0 && version >= 0,
        "Invalid session identity"
    );
    let message = format!("{id}{SEPARATOR}{timestamp}{SEPARATOR}{version}");
    let signature = mac(secret, &message)?.finalize().into_bytes();
    Ok(format!(
        "{message}{SEPARATOR}{}",
        URL_SAFE_NO_PAD.encode(signature)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trips_and_rejects_tampering_expiry_and_oversize() {
        let secret = "synthetic-cookie-signing-key";
        for (id, version, time) in [
            (1, 0, 0),
            (128, 3, 1_700_000_000),
            (i32::MAX, i32::MAX, 1_800_000_000),
        ] {
            let session = Session { id, version };
            let encoded = encode(session, secret, time).unwrap();
            assert_eq!(decode(&encoded, secret, time).unwrap(), session);
            assert!(decode(&encoded, "incorrect-key", time).is_err());
            assert!(decode(&encoded, secret, time + MAX_AGE + 1).is_err());
        }
        assert!(decode(&"x".repeat(MAX_ENCODED_LENGTH + 1), secret, 0).is_err());
        assert!(decode("invalid", secret, 0).is_err());
        let session = Session { id: 7, version: 1 };
        let encoded = encode(session, secret, 0).unwrap();
        let signature = encoded.rsplit_once(SEPARATOR).unwrap().1;
        assert!(decode(&format!("8.0.1.{signature}"), secret, 0).is_err());
        assert!(decode(&format!("7.0.0.{signature}"), secret, 0).is_err());
        assert!(decode(&format!("7.0.{signature}"), secret, 0).is_err());
        assert!(encode(Session { id: 0, version: 0 }, secret, 0).is_err());
    }

    #[test]
    fn cookies_without_a_version_are_version_zero() {
        let secret = "synthetic-cookie-signing-key";
        let message = "7.1700000000";
        let signature = mac(secret, message).unwrap().finalize().into_bytes();
        let encoded = format!("{message}{SEPARATOR}{}", URL_SAFE_NO_PAD.encode(signature));
        assert_eq!(
            decode(&encoded, secret, 1_700_000_000).unwrap(),
            Session { id: 7, version: 0 }
        );
    }
}
