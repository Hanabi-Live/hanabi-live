// Derived from Go's legacy math/rand; see packages/data/src/json/goRandom.LICENSE.
use std::sync::OnceLock;

/// The CRC-64 ECMA polynomial in reversed bit order, as Go's `crc64.ECMA` table uses it.
const CRC64_ECMA_REVERSED: u64 = 0xc96c_5795_d787_0f42;

pub fn seed_hash(seed: &str) -> i64 {
    let mut crc = u64::MAX;
    for byte in seed.as_bytes() {
        crc ^= u64::from(*byte);
        for _ in 0..u8::BITS {
            crc = (crc >> 1) ^ if crc & 1 != 0 { CRC64_ECMA_REVERSED } else { 0 };
        }
    }
    (!crc).cast_signed()
}

// Go's `math/rand` source: an additive lagged Fibonacci generator, seeded with a
// Park-Miller generator that avoids overflow by splitting `i32::MAX` by its multiplier.
/// The generator's state length (Go's `rngLen`).
const RNG_LEN: usize = 607;
/// The lag between the two state words that each step adds (Go's `rngTap`).
const RNG_TAP: usize = 273;
/// Park-Miller's multiplier, and the quotient and remainder of `i32::MAX` divided by it.
const SEED_A: i64 = 48_271;
const SEED_Q: i64 = 44_488;
const SEED_R: i64 = 3399;
/// The seed that Go uses in place of zero.
const ZERO_SEED: i64 = 89_482_311;
/// The seeding steps that Go discards before filling the state.
const DISCARDED_SEED_STEPS: usize = 20;
/// The offsets at which Go combines three seeding steps into each state word.
const SEED_HIGH_SHIFT: u32 = 40;
const SEED_MIDDLE_SHIFT: u32 = 20;
/// The bits in Go's non-negative `Int63` and `Int31` results.
const INT63_BITS: u32 = i64::BITS - 1;
const INT31_BITS: u32 = i32::BITS - 1;

pub struct GoRandom {
    state: [u64; RNG_LEN],
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
            assert_eq!(words.len(), RNG_LEN);
            words
                .iter()
                .map(|word| word.parse().expect("signed Go constant"))
                .collect()
        });
        let mut x = seed.rem_euclid(i64::from(i32::MAX));
        if x == 0 {
            x = ZERO_SEED;
        }
        let step = |x: i64| {
            let next = SEED_A * (x % SEED_Q) - SEED_R * (x / SEED_Q);
            if next < 0 {
                next + i64::from(i32::MAX)
            } else {
                next
            }
        };
        let mut state = [0; RNG_LEN];
        for _ in 0..DISCARDED_SEED_STEPS {
            x = step(x);
        }
        for (slot, cooked) in state.iter_mut().zip(cooked) {
            x = step(x);
            let mut value = x.cast_unsigned() << SEED_HIGH_SHIFT;
            x = step(x);
            value ^= x.cast_unsigned() << SEED_MIDDLE_SHIFT;
            x = step(x);
            *slot = value ^ x.cast_unsigned() ^ cooked.cast_unsigned();
        }
        Self {
            state,
            tap: 0,
            feed: RNG_LEN - RNG_TAP,
        }
    }

    pub fn int63(&mut self) -> u64 {
        self.tap = (self.tap + RNG_LEN - 1) % RNG_LEN;
        self.feed = (self.feed + RNG_LEN - 1) % RNG_LEN;
        let value = self.state[self.feed].wrapping_add(self.state[self.tap]);
        self.state[self.feed] = value;
        value & (u64::MAX >> 1)
    }

    pub fn intn(&mut self, bound: u64) -> u64 {
        assert!(bound > 0 && i64::try_from(bound).is_ok());
        let small = i32::try_from(bound).is_ok();
        let range = 1_u64 << if small { INT31_BITS } else { INT63_BITS };
        let maximum = range - 1 - range % bound;
        loop {
            let value = if small {
                self.int63() >> (INT63_BITS - INT31_BITS)
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
