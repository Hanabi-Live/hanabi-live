//! The detrimental characters that the rules know, by their names in `characters.json`.

use crate::EnginePlayer;

/// The character name that test accounts' players other than the first get: none.
pub const NO_CHARACTER: &str = "n/a";

/// A detrimental character. Players store the character's name, which this parses.
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
    /// Each character with its name in `characters.json`.
    pub const ALL: [(Self, &'static str); 31] = [
        (Self::Fuming, "Fuming"),
        (Self::Dumbfounded, "Dumbfounded"),
        (Self::Inept, "Inept"),
        (Self::Awkward, "Awkward"),
        (Self::Conservative, "Conservative"),
        (Self::Greedy, "Greedy"),
        (Self::Picky, "Picky"),
        (Self::Spiteful, "Spiteful"),
        (Self::Insolent, "Insolent"),
        (Self::Vindictive, "Vindictive"),
        (Self::Miser, "Miser"),
        (Self::Compulsive, "Compulsive"),
        (Self::MoodSwings, "Mood Swings"),
        (Self::Insistent, "Insistent"),
        (Self::Vulnerable, "Vulnerable"),
        (Self::ColorBlind, "Color-Blind"),
        (Self::Impulsive, "Impulsive"),
        (Self::Indolent, "Indolent"),
        (Self::Hesitant, "Hesitant"),
        (Self::Anxious, "Anxious"),
        (Self::Traumatized, "Traumatized"),
        (Self::Wasteful, "Wasteful"),
        (Self::Genius, "Genius"),
        (Self::Panicky, "Panicky"),
        (Self::Contrarian, "Contrarian"),
        (Self::Stubborn, "Stubborn"),
        (Self::BlindSpot, "Blind Spot"),
        (Self::Oblivious, "Oblivious"),
        (Self::Follower, "Follower"),
        (Self::SlowWitted, "Slow-Witted"),
        (Self::Quacker, "Quacker"),
    ];

    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL
            .iter()
            .find(|(_, known)| *known == name)
            .map(|(character, _)| *character)
    }

    /// Whether the character's metadata is chosen when it is assigned, such as Fuming's color, and
    /// so recorded with the game.
    pub const fn has_assigned_metadata(self) -> bool {
        matches!(
            self,
            Self::Fuming | Self::Dumbfounded | Self::Inept | Self::Awkward
        )
    }

    pub fn name(self) -> &'static str {
        Self::ALL
            .iter()
            .find(|(character, _)| *character == self)
            .map_or("", |(_, name)| name)
    }
}

impl EnginePlayer {
    /// The player's detrimental character, or `None` when the player has none.
    pub fn character(&self) -> Option<Character> {
        Character::from_name(&self.character)
    }

    /// The metadata chosen when the player's character was assigned, which games record, or
    /// `None` when the character has none.
    pub fn assigned_metadata(&self) -> Option<i32> {
        self.character()
            .is_some_and(Character::has_assigned_metadata)
            .then_some(self.character_metadata)
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
        let known: Vec<_> = Character::ALL.iter().map(|(_, name)| *name).collect();
        assert_eq!(catalog, known);
        for (character, name) in Character::ALL {
            assert_eq!(Character::from_name(name), Some(character));
            assert_eq!(character.name(), name);
        }
    }
}
