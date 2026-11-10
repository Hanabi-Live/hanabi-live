//! Replays: imported games and the controls of shared replays.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

/// A game in the replay format: exported by the server and copied by the client. `ReplayImport`
/// reads it back.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayGame {
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub id: i64,
    pub player_names: Vec<String>,
    pub deck: Vec<ReplayCard>,
    pub actions: Vec<ReplayGameAction>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ReplayOptions")]
    pub options: Option<ReplayOptions>,
    /// Each player's notes, indexed by card order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ReplayNoteRow>")]
    pub notes: Option<Vec<Vec<String>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ReplayCharacter>")]
    pub characters: Option<Vec<ReplayCharacter>>,
    /// Absent for a game with its own deck instead of a seed, such as an imported one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub seed: Option<String>,
}

/// One player's notes, indexed by card order.
#[derive(JsonSchema)]
#[serde(transparent)]
#[expect(dead_code, reason = "Only describes the schema of a note row")]
struct ReplayNoteRow(Vec<String>);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayCard {
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub suit_index: i64,
    #[schemars(with = "CardRank")]
    pub rank: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ReplayAction {
    #[serde(rename = "type")]
    pub kind: RecordedActionType,
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub target: i32,
    #[serde(default)]
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub value: i32,
}

/// Only options that differ from their defaults are included.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub timed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_base_seconds: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_per_turn_seconds: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub speedrun: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub deck_plays: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub empty_clues: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub one_extra_card: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub one_less_card: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub all_or_nothing: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub detrimental_characters: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ReplayCharacter {
    /// Empty when the player has no character.
    pub name: String,
    /// Absent when the character has no assigned metadata.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i32", range(min = i32::MIN, max = i32::MAX))]
    pub metadata: Option<i32>,
}

/// A game to import, in the format that `ReplayGame` exports. Every field is optional: a seed alone
/// determines the deck, and missing options take their defaults. The server checks the game itself,
/// such as whether the deck matches the seed.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayImport {
    /// The exported game's database ID. Importing does not use it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 0, max = MAX_SAFE_INTEGER))]
    pub id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<String>", length(max = MAX_PLAYERS))]
    pub player_names: Option<Vec<String>>,
    /// The deck, by card order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ImportCard>", length(max = MAX_DECK_SIZE))]
    pub deck: Option<Vec<ImportCard>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ReplayGameAction>", length(max = MAX_GAME_ACTIONS))]
    pub actions: Option<Vec<ReplayGameAction>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ImportOptions")]
    pub options: Option<ImportOptions>,
    /// Each player's notes, indexed by card order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ImportNoteRow>", length(max = MAX_PLAYERS))]
    pub notes: Option<Vec<ImportNoteRow>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ImportCharacter>", length(max = MAX_PLAYERS))]
    pub characters: Option<Vec<ImportCharacter>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub seed: Option<String>,
}

/// One player's imported notes, indexed by card order.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct ImportNoteRow(pub Vec<String>);

/// A card in an imported deck. A missing identity is 0.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportCard {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 0, max = MAX_SAFE_INTEGER))]
    pub suit_index: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i32", range(min = i32::MIN, max = i32::MAX))]
    pub rank: Option<i32>,
}

/// A turn, or the end of the game, in the replay format.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ReplayGameAction {
    Play {
        #[schemars(with = "CardOrder")]
        order: i32,
    },
    Discard {
        #[schemars(with = "CardOrder")]
        order: i32,
    },
    ColorClue {
        /// The player who receives the clue.
        #[schemars(with = "PlayerIndex")]
        target: i32,
        /// The index of the color in the variant's clue colors.
        #[schemars(range(min = 0, max = MAX_SUIT_INDEX), extend("enum" = suits()))]
        color_index: i32,
    },
    RankClue {
        /// The player who receives the clue.
        #[schemars(with = "PlayerIndex")]
        target: i32,
        #[schemars(range(min = MIN_RANK, max = MAX_RANK), extend("enum" = ranks()))]
        rank: i32,
    },
    GameOver {
        end_condition: EndCondition,
        /// The player who ended the game, such as the one who timed out. Absent when no player
        /// did.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "PlayerIndex")]
        player_index: Option<i32>,
    },
}

impl ReplayGameAction {
    /// An action from a game's record. Fails for a game over with an unknown end condition.
    pub fn from_recorded(action: ReplayAction) -> Result<Self, String> {
        let ReplayAction {
            kind,
            target,
            value,
        } = action;
        Ok(match kind {
            RecordedActionType::Play => Self::Play { order: target },
            RecordedActionType::Discard => Self::Discard { order: target },
            RecordedActionType::ColorClue => Self::ColorClue {
                target,
                color_index: value,
            },
            RecordedActionType::RankClue => Self::RankClue {
                target,
                rank: value,
            },
            RecordedActionType::GameOver | RecordedActionType::GameOverByVote => Self::GameOver {
                end_condition: EndCondition::try_from(value)?,
                player_index: (target != NO_VALUE).then_some(target),
            },
        })
    }

    /// The action as a game's record stores it.
    pub fn recorded(self) -> ReplayAction {
        let (kind, target, value) = match self {
            Self::Play { order } => (RecordedActionType::Play, order, 0),
            Self::Discard { order } => (RecordedActionType::Discard, order, 0),
            Self::ColorClue {
                target,
                color_index,
            } => (RecordedActionType::ColorClue, target, color_index),
            Self::RankClue { target, rank } => (RecordedActionType::RankClue, target, rank),
            Self::GameOver {
                end_condition,
                player_index,
            } => (
                if end_condition == EndCondition::TerminatedByVote {
                    RecordedActionType::GameOverByVote
                } else {
                    RecordedActionType::GameOver
                },
                player_index.unwrap_or(NO_VALUE),
                i32::from(end_condition),
            ),
        };
        ReplayAction {
            kind,
            target,
            value,
        }
    }
}

/// A player's character in an imported game. A missing name is no character.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ImportCharacter {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i32", range(min = i32::MIN, max = i32::MAX))]
    pub metadata: Option<i32>,
}

/// The options of an imported game. Missing options take their defaults.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub timed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_base_seconds: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_per_turn_seconds: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub speedrun: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub deck_plays: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub empty_clues: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub one_extra_card: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub one_less_card: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub all_or_nothing: Option<bool>,
    /// When present, even as false, the game must assign every player a character.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub detrimental_characters: Option<bool>,
}

/// What a shared-replay arrow points at: a card, or a part of the board.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum ReplayArrowTarget {
    Card(#[schemars(with = "CardOrder")] i64),
    Board(ReplayBoardElement),
}

/// The parts of the board that a shared-replay arrow can point at, besides cards.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ReplayBoardElement {
    Deck,
    Turn,
    Score,
    MaxScore,
    Clues,
    Strike1,
    Strike2,
    Strike3,
    Pace,
    Efficiency,
    MinEfficiency,
}

/// A sound effect that a shared-replay leader plays for everyone watching.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ReplaySoundEffect {
    Buzz,
    Clap,
    Holy,
    Nooo,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayLeader {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub username: String,
}

/// The players in a shared replay who will not play again if the leader restarts.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestartDeclined {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(length(max = MAX_PLAYERS))]
    pub usernames: Vec<String>,
}

/// A spectator suggesting a turn to the shared replay's leader.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Suggestion {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub username: String,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub segment: i64,
}

/// The active hypothetical, sent to someone joining a shared replay.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Hypothetical {
    pub show_drawn_cards: bool,
    /// The hypothetical's actions so far, in order.
    pub actions: Vec<HypotheticalAction>,
}

/// One action in a hypothetical. The server relays these; each client applies them to its own copy
/// of the game. A card identity that the recipient may not see is absent.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HypotheticalAction {
    Draw {
        #[schemars(with = "PlayerIndex")]
        player_index: i64,
        #[schemars(with = "CardOrder")]
        order: i64,
        /// Absent when the recipient may not see the card.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "SuitIndex")]
        suit_index: Option<i64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "CardRank")]
        rank: Option<i64>,
    },
    Play {
        #[schemars(with = "PlayerIndex")]
        player_index: i64,
        #[schemars(with = "CardOrder")]
        order: i64,
        /// Absent when the recipient may not see the card.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "SuitIndex")]
        suit_index: Option<i64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "CardRank")]
        rank: Option<i64>,
    },
    Discard {
        #[schemars(with = "PlayerIndex")]
        player_index: i64,
        #[schemars(with = "CardOrder")]
        order: i64,
        /// Absent when the recipient may not see the card.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "SuitIndex")]
        suit_index: Option<i64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "CardRank")]
        rank: Option<i64>,
        failed: bool,
    },
    Clue {
        /// Absent when the recipient may not see the clue's type and value.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "ReceivedClue")]
        clue: Option<Clue>,
        #[schemars(with = "PlayerIndex")]
        giver: i64,
        #[schemars(with = "PlayerIndex")]
        target: i64,
        /// The orders of the cards the clue touched.
        #[schemars(with = "Vec<CardOrder>", extend("x-readonly" = true))]
        orders: Vec<SafeInteger>,
        ignore_negative: bool,
    },
    Turn {
        #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
        num: i64,
        /// Absent once the game has ended.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "PlayerIndex")]
        current_player_index: Option<u8>,
    },
    /// Shows a card as another identity.
    Morph {
        #[schemars(with = "CardOrder")]
        order: i64,
        /// Absent when the recipient may not see the card.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "SuitIndex")]
        suit_index: Option<i64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "CardRank")]
        rank: Option<i64>,
    },
    /// Shows a morphed card as its original identity again.
    Unmorph {
        #[schemars(with = "CardOrder")]
        order: i64,
    },
}
