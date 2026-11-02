// Derived from Go's legacy math/rand; see packages/server/src/engine/goRandom.LICENSE.
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
    Ok(!crc as i64)
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
            let words: Vec<String> = serde_json::from_str(include_str!(
                "../../../packages/server/src/engine/goRandom.json"
            ))
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
        for index in -20_i32..607 {
            x = step(x);
            if index >= 0 {
                let mut value = (x as u64) << 40;
                x = step(x);
                value ^= (x as u64) << 20;
                x = step(x);
                state[index as usize] = value ^ x as u64 ^ cooked[index as usize] as u64;
            }
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
        assert!(bound > 0 && bound <= i64::MAX as u64);
        let small = bound <= i32::MAX as u64;
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

    pub fn shuffle<T>(&mut self, values: &mut [T]) {
        for index in 0..values.len() {
            values.swap(index, self.intn(index as u64 + 1) as usize);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn matches_go_seed_and_random_corpus() {
        let corpus: Value = serde_json::from_str(include_str!(
            "../../../server/src/testdata/random_protocol.json"
        ))
        .unwrap();
        for item in corpus["seeds"].as_array().unwrap() {
            assert_eq!(
                seed_hash(item["input"].as_str().unwrap())
                    .unwrap()
                    .to_string(),
                item["value"].as_str().unwrap()
            );
        }
        for item in corpus["streams"].as_array().unwrap() {
            let seed = item["seed"].as_str().unwrap().parse().unwrap();
            let mut rng = GoRandom::new(seed);
            for value in item["int63"].as_array().unwrap() {
                assert_eq!(rng.int63().to_string(), value.as_str().unwrap());
            }
            let mut rng = GoRandom::new(seed);
            for value in item["intn"].as_array().unwrap() {
                assert_eq!(
                    rng.intn(value["bound"].as_u64().unwrap()),
                    value["value"].as_u64().unwrap()
                );
            }
        }
    }
}
