//! The detrimental characters that the rules know, by their names in `characters.json`.

use crate::{ClueType, EnginePlayer, RecordedActionType, Variant};
use anyhow::{Context, Result, bail};
use hanabi_protocol::{MAX_RANK, MIN_RANK};

/// A detrimental character.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Character {
    Fuming,
    Dumbfounded,
    Inept,
    Awkward,
    Conservative,
    Greedy,
    Picky,
    Spiteful,
    Insolent,
    Vindictive,
    Miser,
    Compulsive,
    MoodSwings,
    Insistent,
    Vulnerable,
    ColorBlind,
    Impulsive,
    Indolent,
    Hesitant,
    Anxious,
    Traumatized,
    Wasteful,
    Genius,
    Panicky,
    Contrarian,
    Stubborn,
    BlindSpot,
    Oblivious,
    Follower,
    SlowWitted,
    Quacker,
}

impl Character {
    /// Each character, in the order of `characters.json`.
    pub const ALL: [Self; 31] = [
        Self::Fuming,
        Self::Dumbfounded,
        Self::Inept,
        Self::Awkward,
        Self::Conservative,
        Self::Greedy,
        Self::Picky,
        Self::Spiteful,
        Self::Insolent,
        Self::Vindictive,
        Self::Miser,
        Self::Compulsive,
        Self::MoodSwings,
        Self::Insistent,
        Self::Vulnerable,
        Self::ColorBlind,
        Self::Impulsive,
        Self::Indolent,
        Self::Hesitant,
        Self::Anxious,
        Self::Traumatized,
        Self::Wasteful,
        Self::Genius,
        Self::Panicky,
        Self::Contrarian,
        Self::Stubborn,
        Self::BlindSpot,
        Self::Oblivious,
        Self::Follower,
        Self::SlowWitted,
        Self::Quacker,
    ];

    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|character| character.name() == name)
    }

    /// The kind of value that the character is assigned, which games record: a clue color, such as
    /// Fuming's, or a rank, such as Awkward's. `None` for a character that is assigned none.
    pub const fn assigned_value_type(self) -> Option<ClueType> {
        match self {
            Self::Fuming | Self::Inept => Some(ClueType::Color),
            Self::Dumbfounded | Self::Awkward => Some(ClueType::Rank),
            _ => None,
        }
    }

    /// The character's name in `characters.json`.
    pub const fn name(self) -> &'static str {
        match self {
            Self::Fuming => "Fuming",
            Self::Dumbfounded => "Dumbfounded",
            Self::Inept => "Inept",
            Self::Awkward => "Awkward",
            Self::Conservative => "Conservative",
            Self::Greedy => "Greedy",
            Self::Picky => "Picky",
            Self::Spiteful => "Spiteful",
            Self::Insolent => "Insolent",
            Self::Vindictive => "Vindictive",
            Self::Miser => "Miser",
            Self::Compulsive => "Compulsive",
            Self::MoodSwings => "Mood Swings",
            Self::Insistent => "Insistent",
            Self::Vulnerable => "Vulnerable",
            Self::ColorBlind => "Color-Blind",
            Self::Impulsive => "Impulsive",
            Self::Indolent => "Indolent",
            Self::Hesitant => "Hesitant",
            Self::Anxious => "Anxious",
            Self::Traumatized => "Traumatized",
            Self::Wasteful => "Wasteful",
            Self::Genius => "Genius",
            Self::Panicky => "Panicky",
            Self::Contrarian => "Contrarian",
            Self::Stubborn => "Stubborn",
            Self::BlindSpot => "Blind Spot",
            Self::Oblivious => "Oblivious",
            Self::Follower => "Follower",
            Self::SlowWitted => "Slow-Witted",
            Self::Quacker => "Quacker",
        }
    }
}

/// A player's detrimental character, with the value that it is assigned and what it remembers
/// between turns.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CharacterState {
    /// Can only clue ranks and `color`, an index into the variant's clue colors.
    Fuming {
        color: i32,
    },
    /// Can only clue colors and `rank`.
    Dumbfounded {
        rank: i32,
    },
    /// Cannot give a clue that touches a card that a clue of `color` touches. `color` is an index
    /// into the variant's clue colors.
    Inept {
        color: i32,
    },
    /// Cannot give a clue that touches a card of `rank`.
    Awkward {
        rank: i32,
    },
    Conservative,
    Greedy,
    Picky,
    Spiteful,
    Insolent,
    /// `clued` from when someone clues them until their next turn, which must be a clue.
    Vindictive {
        clued: bool,
    },
    Miser,
    Compulsive,
    /// The type of their previous clue, which their next clue cannot repeat.
    MoodSwings {
        previous_clue: Option<ClueType>,
    },
    /// `cluing` while a card that they clued is in a hand, so that each of their clues must touch
    /// such a card.
    Insistent {
        cluing: bool,
    },
    Vulnerable,
    ColorBlind,
    /// `slot_one_clued` from when a clue touches their newest card until their next turn, which
    /// must play it.
    Impulsive {
        slot_one_clued: bool,
    },
    /// `played` when their previous turn played a card, so that this one cannot.
    Indolent {
        played: bool,
    },
    Hesitant,
    Anxious,
    Traumatized,
    Wasteful,
    /// The player whom their color clue went to, while they owe that player a rank clue this turn.
    Genius {
        second_clue_target: Option<usize>,
    },
    /// `discarding_again` while they must discard a second time this turn.
    Panicky {
        discarding_again: bool,
    },
    Contrarian,
    /// The type of the previous player's action, which their action cannot repeat. Every clue
    /// counts as the same type.
    Stubborn {
        previous_action: Option<RecordedActionType>,
    },
    BlindSpot,
    Oblivious,
    Follower,
    SlowWitted,
    Quacker,
}

impl CharacterState {
    /// The character as it starts a game, with the value that it was assigned, which only
    /// Fuming, Dumbfounded, Inept, and Awkward have.
    pub fn new(character: Character, assigned: Option<i32>, variant: &Variant) -> Result<Self> {
        let color = || {
            assigned
                .filter(|color| {
                    usize::try_from(*color).is_ok_and(|i| i < variant.clue_colors.len())
                })
                .with_context(|| {
                    format!(
                        "{} needs one of the variant's clue colors.",
                        character.name()
                    )
                })
        };
        let rank = || {
            assigned
                .filter(|rank| (MIN_RANK..=MAX_RANK).contains(rank))
                .with_context(|| format!("{} needs a rank to clue.", character.name()))
        };
        if assigned.is_some() && character.assigned_value_type().is_none() {
            bail!("{} is not assigned a value.", character.name());
        }
        Ok(match character {
            Character::Fuming => Self::Fuming { color: color()? },
            Character::Dumbfounded => Self::Dumbfounded { rank: rank()? },
            Character::Inept => Self::Inept { color: color()? },
            Character::Awkward => Self::Awkward { rank: rank()? },
            Character::Conservative => Self::Conservative,
            Character::Greedy => Self::Greedy,
            Character::Picky => Self::Picky,
            Character::Spiteful => Self::Spiteful,
            Character::Insolent => Self::Insolent,
            Character::Vindictive => Self::Vindictive { clued: false },
            Character::Miser => Self::Miser,
            Character::Compulsive => Self::Compulsive,
            Character::MoodSwings => Self::MoodSwings {
                previous_clue: None,
            },
            Character::Insistent => Self::Insistent { cluing: false },
            Character::Vulnerable => Self::Vulnerable,
            Character::ColorBlind => Self::ColorBlind,
            Character::Impulsive => Self::Impulsive {
                slot_one_clued: false,
            },
            Character::Indolent => Self::Indolent { played: false },
            Character::Hesitant => Self::Hesitant,
            Character::Anxious => Self::Anxious,
            Character::Traumatized => Self::Traumatized,
            Character::Wasteful => Self::Wasteful,
            Character::Genius => Self::Genius {
                second_clue_target: None,
            },
            Character::Panicky => Self::Panicky {
                discarding_again: false,
            },
            Character::Contrarian => Self::Contrarian,
            Character::Stubborn => Self::Stubborn {
                previous_action: None,
            },
            Character::BlindSpot => Self::BlindSpot,
            Character::Oblivious => Self::Oblivious,
            Character::Follower => Self::Follower,
            Character::SlowWitted => Self::SlowWitted,
            Character::Quacker => Self::Quacker,
        })
    }

    pub const fn character(self) -> Character {
        match self {
            Self::Fuming { .. } => Character::Fuming,
            Self::Dumbfounded { .. } => Character::Dumbfounded,
            Self::Inept { .. } => Character::Inept,
            Self::Awkward { .. } => Character::Awkward,
            Self::Conservative => Character::Conservative,
            Self::Greedy => Character::Greedy,
            Self::Picky => Character::Picky,
            Self::Spiteful => Character::Spiteful,
            Self::Insolent => Character::Insolent,
            Self::Vindictive { .. } => Character::Vindictive,
            Self::Miser => Character::Miser,
            Self::Compulsive => Character::Compulsive,
            Self::MoodSwings { .. } => Character::MoodSwings,
            Self::Insistent { .. } => Character::Insistent,
            Self::Vulnerable => Character::Vulnerable,
            Self::ColorBlind => Character::ColorBlind,
            Self::Impulsive { .. } => Character::Impulsive,
            Self::Indolent { .. } => Character::Indolent,
            Self::Hesitant => Character::Hesitant,
            Self::Anxious => Character::Anxious,
            Self::Traumatized => Character::Traumatized,
            Self::Wasteful => Character::Wasteful,
            Self::Genius { .. } => Character::Genius,
            Self::Panicky { .. } => Character::Panicky,
            Self::Contrarian => Character::Contrarian,
            Self::Stubborn { .. } => Character::Stubborn,
            Self::BlindSpot => Character::BlindSpot,
            Self::Oblivious => Character::Oblivious,
            Self::Follower => Character::Follower,
            Self::SlowWitted => Character::SlowWitted,
            Self::Quacker => Character::Quacker,
        }
    }

    /// The value that the character was assigned, as games record it: a clue color index or a
    /// rank. `None` for a character that has none.
    pub const fn assigned_value(self) -> Option<i32> {
        match self {
            Self::Fuming { color } | Self::Inept { color } => Some(color),
            Self::Dumbfounded { rank } | Self::Awkward { rank } => Some(rank),
            _ => None,
        }
    }
}

impl EnginePlayer {
    /// The player's character, without what it remembers.
    pub fn character(&self) -> Option<Character> {
        self.character_state.map(CharacterState::character)
    }

    /// The value that the player's character was assigned, as games record it.
    pub fn assigned_value(&self) -> Option<i32> {
        self.character_state
            .and_then(CharacterState::assigned_value)
    }

    /// Whether the player has this character.
    pub fn is(&self, character: Character) -> bool {
        self.character() == Some(character)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_character_in_the_catalog_is_known_by_name() {
        let catalog: Vec<_> = crate::characters()
            .iter()
            .map(|c| c.name.as_str())
            .collect();
        let known: Vec<_> = Character::ALL.iter().map(|c| c.name()).collect();
        assert_eq!(catalog, known);
        let variant = crate::get_variant(hanabi_protocol::DEFAULT_VARIANT_NAME).unwrap();
        for character in Character::ALL {
            assert_eq!(Character::from_name(character.name()), Some(character));
            let assigned = character.assigned_value_type().map(|_| 1);
            let state = CharacterState::new(character, assigned, variant).unwrap();
            assert_eq!(state.character(), character);
            assert_eq!(state.assigned_value(), assigned);
        }
    }
}
