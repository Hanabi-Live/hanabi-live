use hanabi_protocol::{
    CardOrder, ColorClueTurn, ColorIndex, DEFAULT_VARIANT_NAME, GameOverTurn, MIN_PLAYERS,
    NO_VALUE, PlayerIndex, RankClueNumber, RankClueTurn, ReplayGameAction, TargetCard,
};
pub use hanabi_protocol::{ClueType, EndCondition};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub num_players: usize,
    pub variant_name: String,
    #[serde(rename = "variantID", skip_serializing_if = "Option::is_none")]
    pub variant_id: Option<u32>,
    pub timed: bool,
    /// The starting clock of a timed game, in whole seconds.
    #[serde(deserialize_with = "whole_seconds")]
    pub time_base: i64,
    pub time_per_turn: i64,
    pub speedrun: bool,
    pub deck_plays: bool,
    pub empty_clues: bool,
    pub one_extra_card: bool,
    pub one_less_card: bool,
    pub all_or_nothing: bool,
    pub detrimental_characters: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_players: Option<usize>,
}

/// Reads a time base in whole seconds. Checkpoints that servers wrote before time bases were whole
/// seconds hold a number with a fraction, which this drops.
fn whole_seconds<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<i64, D::Error> {
    #[expect(
        clippy::cast_precision_loss,
        reason = "the largest safe integer is exact as a float"
    )]
    const LIMIT: f64 = hanabi_protocol::MAX_SAFE_INTEGER as f64;
    let seconds = f64::deserialize(deserializer)?;
    if !seconds.is_finite() || seconds.abs() > LIMIT {
        return Err(serde::de::Error::custom("Invalid time base"));
    }
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the check above bounds the value, and the fraction is dropped on purpose"
    )]
    Ok(seconds as i64)
}

/// Must match `hanabi_protocol::GameOptions::default()`; a server test checks this.
impl Default for Options {
    fn default() -> Self {
        Self {
            num_players: MIN_PLAYERS,
            variant_name: DEFAULT_VARIANT_NAME.into(),
            variant_id: None,
            timed: false,
            time_base: 0,
            time_per_turn: 0,
            speedrun: false,
            deck_plays: false,
            empty_clues: false,
            one_extra_card: false,
            one_less_card: false,
            all_or_nothing: false,
            detrimental_characters: false,
            table_name: None,
            max_players: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Interpretation {
    /// Actions are what players request. For a card of an inverted suit, a play request
    /// discards it and a discard request plays it.
    #[default]
    Live,
    /// Actions are what happened, as games record them. The engine does not swap them again,
    /// and a finished game has no completion timing.
    Recorded,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeckCard {
    pub suit_index: usize,
    pub rank: i32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssignedCharacter {
    /// Absent when the player has no character.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Absent when the character has no assigned metadata.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<i32>,
}

/// What shuffles the characters of a game without a seed that names none, so that they stay the
/// same each time the game is replayed.
pub const UNSEEDED: &str = "JSON";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameSetup {
    pub options: Options,
    pub player_names: Vec<String>,
    /// The seed that shuffled the deck. Absent for a game with its own deck, such as an imported
    /// one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
    pub deck: Option<Vec<DeckCard>>,
    pub characters: Option<Vec<AssignedCharacter>>,
    #[serde(default)]
    pub interpretation: Interpretation,
}

/// The type of an action in a game's record: a turn, or the end of the game. The database stores
/// these values in `game_actions`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "i32", into = "i32")]
#[repr(i32)]
pub enum RecordedActionType {
    Play = 0,
    Discard = 1,
    ColorClue = 2,
    RankClue = 3,
    /// The game ended. The value is its `EndCondition`, and the target is the player who ended it,
    /// or -1.
    GameOver = 4,
    /// The players voted to end the game.
    GameOverByVote = 5,
}

impl RecordedActionType {
    pub const fn is_clue(self) -> bool {
        matches!(self, Self::ColorClue | Self::RankClue)
    }

    pub const fn is_game_over(self) -> bool {
        matches!(self, Self::GameOver | Self::GameOverByVote)
    }
}

impl TryFrom<i32> for RecordedActionType {
    type Error = String;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        Ok(match value {
            0 => Self::Play,
            1 => Self::Discard,
            2 => Self::ColorClue,
            3 => Self::RankClue,
            4 => Self::GameOver,
            5 => Self::GameOverByVote,
            _ => return Err(format!("Invalid RecordedActionType: {value}")),
        })
    }
}

impl From<RecordedActionType> for i32 {
    fn from(value: RecordedActionType) -> Self {
        value as Self
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlayerAction {
    #[serde(rename = "type")]
    pub action_type: RecordedActionType,
    pub target: i32,
    pub value: i32,
}
pub type RecordedAction = PlayerAction;
impl From<ReplayGameAction> for PlayerAction {
    /// The action as a game's record stores it.
    fn from(action: ReplayGameAction) -> Self {
        let (action_type, target, value) = match action {
            ReplayGameAction::Play(card) => (RecordedActionType::Play, card.order.into(), 0),
            ReplayGameAction::Discard(card) => (RecordedActionType::Discard, card.order.into(), 0),
            ReplayGameAction::ColorClue(clue) => (
                RecordedActionType::ColorClue,
                clue.target.into(),
                clue.color_index.into(),
            ),
            ReplayGameAction::RankClue(clue) => (
                RecordedActionType::RankClue,
                clue.target.into(),
                clue.rank.into(),
            ),
            ReplayGameAction::GameOver(end) => (
                if end.end_condition == EndCondition::TerminatedByVote {
                    RecordedActionType::GameOverByVote
                } else {
                    RecordedActionType::GameOver
                },
                end.player_index.map_or(NO_VALUE, i32::from),
                i32::from(end.end_condition),
            ),
        };
        Self {
            action_type,
            target,
            value,
        }
    }
}

impl From<hanabi_protocol::PlayerAction> for PlayerAction {
    fn from(action: hanabi_protocol::PlayerAction) -> Self {
        ReplayGameAction::from(action).into()
    }
}

impl TryFrom<PlayerAction> for ReplayGameAction {
    type Error = String;

    /// An action from a game's record. Fails for a value that the replay format cannot hold, such
    /// as an unknown end condition.
    fn try_from(action: PlayerAction) -> Result<Self, Self::Error> {
        let PlayerAction {
            action_type,
            target,
            value,
        } = action;
        let invalid = || format!("Invalid recorded action: {action_type:?} {target} {value}");
        let card = || {
            Ok::<_, String>(TargetCard {
                order: CardOrder::new(target).ok_or_else(invalid)?,
            })
        };
        let seat = || PlayerIndex::new(target).ok_or_else(invalid);
        Ok(match action_type {
            RecordedActionType::Play => Self::Play(card()?),
            RecordedActionType::Discard => Self::Discard(card()?),
            RecordedActionType::ColorClue => Self::ColorClue(ColorClueTurn {
                target: seat()?,
                color_index: ColorIndex::new(value).ok_or_else(invalid)?,
            }),
            RecordedActionType::RankClue => Self::RankClue(RankClueTurn {
                target: seat()?,
                rank: RankClueNumber::new(value).ok_or_else(invalid)?,
            }),
            RecordedActionType::GameOver | RecordedActionType::GameOverByVote => {
                Self::GameOver(GameOverTurn {
                    end_condition: EndCondition::try_from(value)?,
                    player_index: if target == NO_VALUE {
                        None
                    } else {
                        Some(seat()?)
                    },
                })
            }
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineCard {
    pub suit_index: usize,
    pub rank: i32,
    pub order: usize,
    pub slot: i32,
    pub touched: bool,
    pub discarded: bool,
    pub played: bool,
    pub failed: bool,
    pub cannot_be_played: bool,
    pub insistent_touched: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnginePlayer {
    pub name: String,
    pub index: usize,
    pub character: String,
    pub character_metadata: i32,
    pub hand: Vec<usize>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clue {
    /// `None` in the events of a recipient who may not see the clue's type.
    #[serde(rename = "type")]
    pub clue_type: Option<ClueType>,
    pub value: i32,
}

/// Converts a count or index, which a game bounds to a few hundred, to a wire integer.
pub fn int(value: usize) -> i32 {
    i32::try_from(value).unwrap_or(i32::MAX)
}

/// The index that a wire integer refers to, or `None` if it is negative.
pub fn index(value: i32) -> Option<usize> {
    usize::try_from(value).ok()
}

/// The kind of clue that a recorded action gives, or `None` for an action that is not a clue.
pub const fn clue_type(action_type: RecordedActionType) -> Option<ClueType> {
    match action_type {
        RecordedActionType::ColorClue => Some(ClueType::Color),
        RecordedActionType::RankClue => Some(ClueType::Rank),
        _ => None,
    }
}

/// The recorded action type that gives a kind of clue.
pub const fn clue_action_type(clue_type: ClueType) -> RecordedActionType {
    match clue_type {
        ClueType::Color => RecordedActionType::ColorClue,
        ClueType::Rank => RecordedActionType::RankClue,
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum EngineEvent {
    Draw {
        player_index: usize,
        order: usize,
        suit_index: i32,
        rank: i32,
    },
    Play {
        player_index: usize,
        order: usize,
        suit_index: i32,
        rank: i32,
    },
    CardIdentity {
        player_index: usize,
        order: usize,
        suit_index: i32,
        rank: i32,
    },
    Discard {
        player_index: usize,
        order: usize,
        suit_index: i32,
        rank: i32,
        failed: bool,
    },
    Clue {
        clue: Clue,
        giver: usize,
        target: usize,
        list: Vec<usize>,
        turn: i32,
    },
    Turn {
        num: i32,
        current_player_index: i32,
    },
    GameOver {
        end_condition: EndCondition,
        player_index: i32,
        votes: Option<Vec<usize>>,
    },
    PlayerTimes {
        player_times: Vec<i64>,
        duration: i64,
    },
}

/// Which way a stack is built. Only reversible and Sudoku variants leave `Undecided`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "i32", into = "i32")]
pub enum StackDirection {
    /// No card has fixed the direction yet.
    Undecided,
    Up,
    Down,
    /// The stack is complete.
    Finished,
}

impl StackDirection {
    const ALL: [Self; 4] = [Self::Undecided, Self::Up, Self::Down, Self::Finished];
}

impl From<StackDirection> for i32 {
    fn from(direction: StackDirection) -> Self {
        direction as Self
    }
}

impl TryFrom<i32> for StackDirection {
    type Error = String;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        Self::ALL
            .into_iter()
            .find(|direction| i32::from(*direction) == value)
            .ok_or_else(|| format!("Invalid stack direction: {value}"))
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineState {
    pub options: Options,
    pub seed: Option<String>,
    pub interpretation: Interpretation,
    pub players: Vec<EnginePlayer>,
    pub deck: Vec<EngineCard>,
    pub deck_index: usize,
    pub stacks: Vec<i32>,
    pub stack_starts: Vec<i32>,
    pub play_stack_directions: Vec<StackDirection>,
    pub turn: i32,
    pub turns_inverted: bool,
    pub active_player_index: usize,
    pub clue_tokens: i32,
    pub score: i32,
    pub max_score: i32,
    pub strikes: i32,
    /// The type of the last clue, which alternating-clue variants need to differ.
    pub last_clue_type_given: Option<ClueType>,
    pub end_condition: EndCondition,
    /// The player whom the game's end names, such as the one who timed out.
    pub end_player: Option<usize>,
    /// The turn after the final round, once the deck has run out.
    pub end_turn: Option<i32>,
    pub events: Vec<EngineEvent>,
    pub actions: Vec<RecordedAction>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletionTiming {
    pub player_times: Vec<i64>,
    pub duration: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Termination {
    pub actor_index: usize,
    pub condition: EndCondition,
    /// The player who ended the game, such as the one who timed out. Absent when no player did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub player_index: Option<usize>,
    pub votes: Option<Vec<usize>>,
}

#[derive(Debug)]
pub struct ActionRejected {
    pub message: String,
    pub silent: bool,
}
impl std::fmt::Display for ActionRejected {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.message.fmt(f)
    }
}
impl std::error::Error for ActionRejected {}
pub(crate) fn reject<T>(message: impl Into<String>) -> anyhow::Result<T> {
    Err(ActionRejected {
        message: message.into(),
        silent: false,
    }
    .into())
}
