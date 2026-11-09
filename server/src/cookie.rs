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
pub const MAX_AGE: i64 = 365 * hanabi_protocol::SECONDS_PER_DAY as i64;
/// The longest encoded cookie we decode, in bytes.
const MAX_ENCODED_LENGTH: usize = 4096;

/// The separator between the user ID, the timestamp, and the signature.
const SEPARATOR: char = '.';

fn mac(secret: &str, message: &str) -> Result<Hmac<Sha256>> {
    ensure!(!secret.is_empty(), "Missing signing key");
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())?;
    mac.update(format!("{NAME}|").as_bytes());
    mac.update(message.as_bytes());
    Ok(mac)
}

/// Reads a cookie in the form `{id}.{timestamp}.{signature}`.
pub fn decode(encoded: &str, secret: &str, now: i64) -> Result<i32> {
    ensure!(encoded.len() <= MAX_ENCODED_LENGTH, "Oversized cookie");
    let Some((message, signature)) = encoded.rsplit_once(SEPARATOR) else {
        bail!("Invalid cookie")
    };
    let Some((id, timestamp)) = message.split_once(SEPARATOR) else {
        bail!("Invalid cookie")
    };
    // Only the server signs cookies, so the signed numbers are well formed.
    mac(secret, message)?.verify_slice(&URL_SAFE_NO_PAD.decode(signature)?)?;
    let id: i32 = id.parse()?;
    ensure!(id > 0, "Invalid user ID");
    ensure!(timestamp.parse::<i64>()? >= now - MAX_AGE, "Expired cookie");
    Ok(id)
}

pub fn encode(id: i32, secret: &str, timestamp: i64) -> Result<String> {
    ensure!(id > 0 && timestamp >= 0, "Invalid session identity");
    let message = format!("{id}{SEPARATOR}{timestamp}");
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
        for (id, time) in [(1, 0), (128, 1_700_000_000), (i32::MAX, 1_800_000_000)] {
            let encoded = encode(id, secret, time).unwrap();
            assert_eq!(decode(&encoded, secret, time).unwrap(), id);
            assert!(decode(&encoded, "incorrect-key", time).is_err());
            assert!(decode(&encoded, secret, time + MAX_AGE + 1).is_err());
        }
        assert!(decode(&"x".repeat(MAX_ENCODED_LENGTH + 1), secret, 0).is_err());
        assert!(decode("invalid", secret, 0).is_err());
        let encoded = encode(7, secret, 0).unwrap();
        let signature = encoded.rsplit_once(SEPARATOR).unwrap().1;
        assert!(decode(&format!("8.0.{signature}"), secret, 0).is_err());
        assert!(encode(0, secret, 0).is_err());
    }
}
