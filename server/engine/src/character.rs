//! The detrimental characters that the rules know, by their names in `characters.json`.

use crate::EnginePlayer;

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

    /// Whether the character's metadata is chosen when it is assigned, such as Fuming's color, and
    /// so recorded with the game.
    pub const fn has_assigned_metadata(self) -> bool {
        matches!(
            self,
            Self::Fuming | Self::Dumbfounded | Self::Inept | Self::Awkward
        )
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

impl EnginePlayer {
    /// The metadata chosen when the player's character was assigned, which games record, or
    /// `None` when the character has none.
    pub fn assigned_metadata(&self) -> Option<i32> {
        self.character
            .is_some_and(Character::has_assigned_metadata)
            .then_some(self.character_metadata)
            .flatten()
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
        for character in Character::ALL {
            assert_eq!(Character::from_name(character.name()), Some(character));
        }
    }
}
