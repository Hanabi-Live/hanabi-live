// Derived from Go's legacy math/rand; see packages/data/src/json/goRandom.LICENSE.
use anyhow::{Result, ensure};
use std::sync::OnceLock;

pub fn seed_hash(seed: &str) -> Result<i64> {
    let bytes = seed.as_bytes();
    let bytes = if seed.starts_with("legacy-") {
        ensure!(bytes.len() >= 9, "Malformed legacy seed");
        &bytes[9..]
    } else {
        bytes
    };
    let mut crc = u64::MAX;
    for byte in bytes {
        crc ^= u64::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1)
                ^ if crc & 1 != 0 {
                    0xc96c_5795_d787_0f42
                } else {
                    0
                };
        }
    }
    Ok((!crc).cast_signed())
}

pub struct GoRandom {
    state: [u64; 607],
    tap: usize,
    feed: usize,
}

impl GoRandom {
    pub fn new(seed: i64) -> Self {
        static COOKED: OnceLock<Vec<i64>> = OnceLock::new();
        let cooked = COOKED.get_or_init(|| {
            let words: Vec<String> =
                serde_json::from_str(include_str!("../../packages/data/src/json/goRandom.json"))
                    .expect("checked-in Go random constants");
            assert_eq!(words.len(), 607);
            words
                .iter()
                .map(|word| word.parse().expect("signed Go constant"))
                .collect()
        });
        let mut x = seed.rem_euclid(i64::from(i32::MAX));
        if x == 0 {
            x = 89_482_311;
        }
        let step = |x: i64| {
            let next = 48_271 * (x % 44_488) - 3399 * (x / 44_488);
            if next < 0 {
                next + i64::from(i32::MAX)
            } else {
                next
            }
        };
        let mut state = [0; 607];
        for _ in 0..20 {
            x = step(x);
        }
        for (slot, cooked) in state.iter_mut().zip(cooked) {
            x = step(x);
            let mut value = x.cast_unsigned() << 40;
            x = step(x);
            value ^= x.cast_unsigned() << 20;
            x = step(x);
            *slot = value ^ x.cast_unsigned() ^ cooked.cast_unsigned();
        }
        Self {
            state,
            tap: 0,
            feed: 334,
        }
    }

    pub fn int63(&mut self) -> u64 {
        self.tap = (self.tap + 606) % 607;
        self.feed = (self.feed + 606) % 607;
        let value = self.state[self.feed].wrapping_add(self.state[self.tap]);
        self.state[self.feed] = value;
        value & (u64::MAX >> 1)
    }

    pub fn intn(&mut self, bound: u64) -> u64 {
        assert!(bound > 0 && i64::try_from(bound).is_ok());
        let small = i32::try_from(bound).is_ok();
        let range = 1_u64 << if small { 31 } else { 63 };
        let maximum = range - 1 - range % bound;
        loop {
            let value = if small {
                self.int63() >> 32
            } else {
                self.int63()
            };
            if bound.is_power_of_two() {
                return value & (bound - 1);
            }
            if value <= maximum {
                return value % bound;
            }
        }
    }

    /// Returns a random index below `len`, drawing the same value as `intn`.
    pub fn index(&mut self, len: usize) -> usize {
        let bound = u64::try_from(len).expect("lengths fit in u64");
        usize::try_from(self.intn(bound)).expect("the value is below a length")
    }

    pub fn shuffle<T>(&mut self, values: &mut [T]) {
        for index in 0..values.len() {
            let other = self.index(index + 1);
            values.swap(index, other);
        }
    }
}
