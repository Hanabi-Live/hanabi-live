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

/// The name of the cookie that marks a browser as one that signed in to an account before.
pub fn device_name(id: i32) -> String {
    format!("{DEVICE_NAME}.{id}")
}
const DEVICE_NAME: &str = "hanabi.device";

/// A browser that signed in to an account before. It gives no access to the account. A login from
/// it is not held back by the failed logins of other clients, so that they cannot lock the owner
/// out (see `accounts::lockout`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Device {
    pub id: i32,
    /// A random number that tells the browsers of one account apart.
    pub nonce: u64,
}

/// `purpose` is the name of the kind of cookie, so that a signature of one kind is not valid for
/// another.
fn mac(secret: &str, purpose: &str, message: &str) -> Result<Hmac<Sha256>> {
    ensure!(!secret.is_empty(), "Missing signing key");
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())?;
    mac.update(format!("{purpose}|").as_bytes());
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
    mac(secret, NAME, message)?.verify_slice(&URL_SAFE_NO_PAD.decode(signature)?)?;
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
    let signature = mac(secret, NAME, &message)?.finalize().into_bytes();
    Ok(format!(
        "{message}{SEPARATOR}{}",
        URL_SAFE_NO_PAD.encode(signature)
    ))
}

/// Reads a device cookie in the form `{id}.{timestamp}.{nonce}.{signature}`.
pub fn decode_device(encoded: &str, secret: &str, now: i64) -> Result<Device> {
    ensure!(encoded.len() <= MAX_ENCODED_LENGTH, "Oversized cookie");
    let Some((message, signature)) = encoded.rsplit_once(SEPARATOR) else {
        bail!("Invalid cookie")
    };
    mac(secret, DEVICE_NAME, message)?.verify_slice(&URL_SAFE_NO_PAD.decode(signature)?)?;
    let mut parts = message.split(SEPARATOR);
    let (Some(id), Some(timestamp), Some(nonce), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        bail!("Invalid cookie")
    };
    ensure!(timestamp.parse::<i64>()? >= now - MAX_AGE, "Expired cookie");
    Ok(Device {
        id: id.parse()?,
        nonce: nonce.parse()?,
    })
}

pub fn encode_device(device: Device, secret: &str, timestamp: i64) -> Result<String> {
    let Device { id, nonce } = device;
    let message = format!("{id}{SEPARATOR}{timestamp}{SEPARATOR}{nonce}");
    let signature = mac(secret, DEVICE_NAME, &message)?.finalize().into_bytes();
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
    fn device_cookies_round_trip_and_are_not_session_cookies() {
        let secret = "synthetic-cookie-signing-key";
        let device = Device {
            id: 7,
            nonce: u64::MAX,
        };
        let encoded = encode_device(device, secret, 100).unwrap();
        assert_eq!(decode_device(&encoded, secret, 100).unwrap(), device);
        assert!(decode_device(&encoded, "incorrect-key", 100).is_err());
        assert!(decode_device(&encoded, secret, 100 + MAX_AGE + 1).is_err());
        let signature = encoded.rsplit_once(SEPARATOR).unwrap().1;
        assert!(decode_device(&format!("8.100.{}.{signature}", u64::MAX), secret, 100).is_err());
        // Neither kind of cookie is valid as the other kind.
        assert!(decode(&encoded, secret, 100).is_err());
        let session = encode(Session { id: 7, version: 1 }, secret, 100).unwrap();
        assert!(decode_device(&session, secret, 100).is_err());
    }

    #[test]
    fn cookies_without_a_version_are_version_zero() {
        let secret = "synthetic-cookie-signing-key";
        let message = "7.1700000000";
        let signature = mac(secret, NAME, message).unwrap().finalize().into_bytes();
        let encoded = format!("{message}{SEPARATOR}{}", URL_SAFE_NO_PAD.encode(signature));
        assert_eq!(
            decode(&encoded, secret, 1_700_000_000).unwrap(),
            Session { id: 7, version: 0 }
        );
    }
}
