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
/// How long a session cookie stays valid, in seconds (one year).
pub const MAX_AGE: i64 = 365 * 24 * 60 * 60;
/// The longest encoded cookie we decode, in bytes.
const MAX_ENCODED_LENGTH: usize = 4096;

// The session payload is a Go gob encoding of `map[interface{}]interface{}{"userID": id}`.
/// The smallest unsigned integer that gob writes with a length prefix instead of as one byte.
const GOB_MIN_PREFIXED_UINT: u64 = 0x80;
/// The gob type ID of `int`.
const GOB_INT_TYPE_ID: i64 = 2;
/// The gob type ID of `string`.
const GOB_STRING_TYPE_ID: i64 = 6;
/// The gob type ID of `interface{}`.
const GOB_INTERFACE_TYPE_ID: i64 = 8;
/// The first gob type ID that an encoder assigns to a type it declares, such as the session map.
const GOB_FIRST_USER_TYPE_ID: i64 = 64;
/// The field delta that ends a gob struct, and that precedes a value that is not a struct.
const GOB_END_OR_SINGLETON: u8 = 0;
/// The field deltas in a gob map declaration: `wireType.MapT`, `MapType.CommonType`, then
/// `CommonType.Id` (its name is empty).
const GOB_MAP_DECLARATION_FIELDS: [u8; 3] = [4, 1, 2];
/// The field delta from a gob map's `CommonType` to its key type, and from that to its value type.
const GOB_NEXT_FIELD: u8 = 1;
/// The session map's entries.
const SESSION_ENTRIES: u8 = 1;

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
        if u64::from(first) < GOB_MIN_PREFIXED_UINT {
            return Ok(u64::from(first));
        }
        // The prefix is the negated length of the big-endian value.
        let count = usize::from(first.wrapping_neg());
        ensure!(count <= size_of::<u64>(), "Invalid integer");
        let mut value = 0_u64;
        for _ in 0..count {
            value = value
                .checked_mul(1 << u8::BITS)
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
    fn expect_int(&mut self, expected: i64, message: &'static str) -> Result<()> {
        ensure!(self.int()? == expected, message);
        Ok(())
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
    ensure!(encoded.len() <= MAX_ENCODED_LENGTH, "Oversized cookie");
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
        (GOB_FIRST_USER_TYPE_ID..=i64::from(i32::MAX)).contains(&type_id),
        "Invalid map type"
    );
    declaration.bytes(&GOB_MAP_DECLARATION_FIELDS)?;
    declaration.expect_int(type_id, "Invalid map type")?;
    declaration.bytes(&[GOB_END_OR_SINGLETON, GOB_NEXT_FIELD])?;
    declaration.expect_int(GOB_INTERFACE_TYPE_ID, "Invalid map key type")?;
    declaration.bytes(&[GOB_NEXT_FIELD])?;
    declaration.expect_int(GOB_INTERFACE_TYPE_ID, "Invalid map value type")?;
    declaration.bytes(&[GOB_END_OR_SINGLETON, GOB_END_OR_SINGLETON])?;
    declaration.end()?;
    let mut values = stream.frame()?;
    values.expect_int(type_id, "Invalid map value")?;
    values.bytes(&[GOB_END_OR_SINGLETON, SESSION_ENTRIES])?;
    values.text(b"string")?;
    values.expect_int(GOB_STRING_TYPE_ID, "Invalid key type")?;
    let mut key = values.frame()?;
    key.bytes(&[GOB_END_OR_SINGLETON])?;
    key.text(b"userID")?;
    key.end()?;
    values.text(b"int")?;
    values.expect_int(GOB_INT_TYPE_ID, "Invalid user ID type")?;
    let mut number = values.frame()?;
    number.bytes(&[GOB_END_OR_SINGLETON])?;
    let id = i32::try_from(number.int()?)?;
    ensure!(id > 0, "Invalid user ID");
    number.end()?;
    values.end()?;
    stream.end()?;
    Ok(id)
}

fn uint(value: u64) -> Vec<u8> {
    if value < GOB_MIN_PREFIXED_UINT {
        return vec![u8::try_from(value).expect("a single-byte value fits in a byte")];
    }
    let bytes = value.to_be_bytes();
    let start = bytes
        .iter()
        .position(|byte| *byte != 0)
        .unwrap_or(bytes.len() - 1);
    // The prefix is the negated length of the big-endian value.
    let length = u8::try_from(bytes.len() - start).expect("a u64 has eight bytes");
    let mut out = vec![length.wrapping_neg()];
    out.extend_from_slice(&bytes[start..]);
    out
}
/// A signed integer, which gob stores with its sign in the lowest bit.
fn int(value: i64) -> Vec<u8> {
    uint(if value < 0 {
        ((!value).cast_unsigned() << 1) | 1
    } else {
        value.cast_unsigned() << 1
    })
}
fn frame(value: &[u8]) -> Vec<u8> {
    let mut out = uint(u64::try_from(value.len()).expect("lengths fit in u64"));
    out.extend_from_slice(value);
    out
}

pub fn encode(id: i32, secret: &str, timestamp: i64) -> Result<String> {
    ensure!(id > 0 && timestamp >= 0, "Invalid session identity");
    let mut declaration = int(-GOB_FIRST_USER_TYPE_ID);
    declaration.extend(GOB_MAP_DECLARATION_FIELDS);
    declaration.extend(int(GOB_FIRST_USER_TYPE_ID));
    declaration.extend([GOB_END_OR_SINGLETON, GOB_NEXT_FIELD]);
    declaration.extend(int(GOB_INTERFACE_TYPE_ID));
    declaration.push(GOB_NEXT_FIELD);
    declaration.extend(int(GOB_INTERFACE_TYPE_ID));
    declaration.extend([GOB_END_OR_SINGLETON, GOB_END_OR_SINGLETON]);
    let mut values = int(GOB_FIRST_USER_TYPE_ID);
    values.extend([GOB_END_OR_SINGLETON, SESSION_ENTRIES]);
    values.extend(frame(b"string"));
    values.extend(int(GOB_STRING_TYPE_ID));
    let mut key = vec![GOB_END_OR_SINGLETON];
    key.extend(frame(b"userID"));
    values.extend(frame(&key));
    values.extend(frame(b"int"));
    values.extend(int(GOB_INT_TYPE_ID));
    let mut value = vec![GOB_END_OR_SINGLETON];
    value.extend(int(i64::from(id)));
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
