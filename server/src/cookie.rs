use anyhow::{Result, bail, ensure};
use base64::{Engine as _, engine::general_purpose::URL_SAFE};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

pub const NAME: &str = "hanabi.sid";
/// `NAME` holds the most recent sign-in, which new tabs use; this keeps each account available to
/// the tabs that signed in to it.
pub fn account_name(id: i32) -> String {
    format!("{NAME}.{id}")
}
const MAX_AGE: i64 = 365 * 24 * 60 * 60;

struct Reader<'a>(&'a [u8]);
impl<'a> Reader<'a> {
    fn byte(&mut self) -> Result<u8> {
        let (byte, rest) = self
            .0
            .split_first()
            .ok_or_else(|| anyhow::anyhow!("Truncated cookie"))?;
        self.0 = rest;
        Ok(*byte)
    }
    fn uint(&mut self) -> Result<u64> {
        let first = self.byte()?;
        if first < 128 {
            return Ok(u64::from(first));
        }
        let count = 256 - usize::from(first);
        ensure!(count <= 8, "Invalid integer");
        let mut value = 0_u64;
        for _ in 0..count {
            value = value
                .checked_mul(256)
                .and_then(|v| v.checked_add(u64::from(self.byte().ok()?)))
                .ok_or_else(|| anyhow::anyhow!("Invalid integer"))?;
        }
        Ok(value)
    }
    fn int(&mut self) -> Result<i64> {
        let value = self.uint()?;
        let magnitude = i64::try_from(value >> 1)?;
        Ok(if value & 1 == 0 {
            magnitude
        } else {
            !magnitude
        })
    }
    fn frame(&mut self) -> Result<Reader<'a>> {
        let count = usize::try_from(self.uint()?)?;
        ensure!(count <= self.0.len(), "Invalid frame");
        let (frame, rest) = self.0.split_at(count);
        self.0 = rest;
        Ok(Reader(frame))
    }
    fn text(&mut self, expected: &[u8]) -> Result<()> {
        ensure!(self.frame()?.0 == expected, "Unexpected cookie field");
        Ok(())
    }
    fn bytes(&mut self, expected: &[u8]) -> Result<()> {
        for byte in expected {
            ensure!(self.byte()? == *byte, "Invalid cookie declaration");
        }
        Ok(())
    }
    fn end(&self) -> Result<()> {
        ensure!(self.0.is_empty(), "Trailing cookie data");
        Ok(())
    }
}

fn mac(secret: &str, message: &[u8]) -> Result<Hmac<Sha256>> {
    ensure!(!secret.is_empty(), "Missing signing key");
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())?;
    mac.update(b"hanabi.sid|");
    mac.update(message);
    Ok(mac)
}

fn decode64(input: &[u8]) -> Result<Vec<u8>> {
    let decoded = URL_SAFE.decode(input)?;
    ensure!(
        URL_SAFE.encode(&decoded).as_bytes() == input,
        "Non-canonical base64"
    );
    Ok(decoded)
}

pub fn decode(encoded: &str, secret: &str, now: i64) -> Result<i32> {
    ensure!(encoded.len() <= 4096, "Oversized cookie");
    let envelope = decode64(encoded.as_bytes())?;
    let separators: Vec<_> = envelope
        .iter()
        .enumerate()
        .filter(|(_, b)| **b == b'|')
        .take(2)
        .map(|(i, _)| i)
        .collect();
    let [first, second] = separators.as_slice() else {
        bail!("Invalid cookie envelope")
    };
    ensure!(*first > 0 && *second > first + 1, "Invalid cookie envelope");
    mac(secret, &envelope[..*second])?.verify_slice(&envelope[second + 1..])?;
    let timestamp = std::str::from_utf8(&envelope[..*first])?;
    ensure!(
        timestamp.bytes().all(|b| b.is_ascii_digit()),
        "Invalid timestamp"
    );
    ensure!(timestamp.parse::<i64>()? >= now - MAX_AGE, "Expired cookie");
    let payload = decode64(&envelope[first + 1..*second])?;
    let mut stream = Reader(&payload);
    let mut declaration = stream.frame()?;
    let type_id = declaration
        .int()?
        .checked_neg()
        .ok_or_else(|| anyhow::anyhow!("Invalid map type"))?;
    ensure!(
        (64..=i64::from(i32::MAX)).contains(&type_id),
        "Invalid map type"
    );
    declaration.bytes(&[4, 1, 2])?;
    ensure!(declaration.int()? == type_id, "Invalid map type");
    declaration.bytes(&[0, 1, 16, 1, 16, 0, 0])?;
    declaration.end()?;
    let mut values = stream.frame()?;
    ensure!(values.int()? == type_id, "Invalid map value");
    values.bytes(&[0, 1])?;
    values.text(b"string")?;
    ensure!(values.int()? == 6, "Invalid key type");
    let mut key = values.frame()?;
    key.bytes(&[0])?;
    key.text(b"userID")?;
    key.end()?;
    values.text(b"int")?;
    ensure!(values.int()? == 2, "Invalid user ID type");
    let mut number = values.frame()?;
    number.bytes(&[0])?;
    let id = i32::try_from(number.int()?)?;
    ensure!(id > 0, "Invalid user ID");
    number.end()?;
    values.end()?;
    stream.end()?;
    Ok(id)
}

fn uint(value: u64) -> Vec<u8> {
    if let Ok(byte) = u8::try_from(value)
        && byte < 128
    {
        return vec![byte];
    }
    let bytes = value.to_be_bytes();
    let start = bytes.iter().position(|byte| *byte != 0).unwrap_or(7);
    // The prefix is the negated length of the big-endian value.
    let mut out = vec![0_u8.wrapping_sub(u8::try_from(8 - start).expect("a u64 has eight bytes"))];
    out.extend_from_slice(&bytes[start..]);
    out
}
fn frame(value: &[u8]) -> Vec<u8> {
    let mut out = uint(u64::try_from(value.len()).expect("lengths fit in u64"));
    out.extend_from_slice(value);
    out
}

pub fn encode(id: i32, secret: &str, timestamp: i64) -> Result<String> {
    ensure!(id > 0 && timestamp >= 0, "Invalid session identity");
    let mut declaration = vec![127, 4, 1, 2];
    declaration.extend(uint(128));
    declaration.extend([0, 1, 16, 1, 16, 0, 0]);
    let mut values = uint(128);
    values.extend([0, 1]);
    values.extend(frame(b"string"));
    values.push(12);
    let mut key = vec![0];
    key.extend(frame(b"userID"));
    values.extend(frame(&key));
    values.extend(frame(b"int"));
    values.push(4);
    let mut value = vec![0];
    value.extend(uint(u64::try_from(id)? * 2));
    values.extend(frame(&value));
    let mut payload = frame(&declaration);
    payload.extend(frame(&values));
    let message = format!("{timestamp}|{}", URL_SAFE.encode(payload));
    let signature = mac(secret, message.as_bytes())?.finalize().into_bytes();
    let mut envelope = format!("{message}|").into_bytes();
    envelope.extend(signature);
    Ok(URL_SAFE.encode(envelope))
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
        assert!(decode(&"x".repeat(4097), secret, 0).is_err());
        assert!(decode("invalid", secret, 0).is_err());
        assert!(encode(0, secret, 0).is_err());
    }
}
