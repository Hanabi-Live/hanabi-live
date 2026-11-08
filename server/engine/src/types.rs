pub use hanabi_protocol::{ActionType, ClueType, EndCondition};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub num_players: usize,
    pub starting_player: usize,
    pub variant_name: String,
    #[serde(rename = "variantID", skip_serializing_if = "Option::is_none")]
    pub variant_id: Option<u32>,
    pub timed: bool,
    pub time_base: f64,
    pub time_per_turn: i64,
    pub speedrun: bool,
    pub card_cycle: bool,
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

/// Must match `hanabi_protocol::GameOptions::default()`; a server test checks this.
impl Default for Options {
    fn default() -> Self {
        Self {
            num_players: 2,
            starting_player: 0,
            variant_name: "No Variant".into(),
            variant_id: None,
            timed: false,
            time_base: 0.0,
            time_per_turn: 0,
            speedrun: false,
            card_cycle: false,
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
    #[default]
    Live,
    LegacyReplay,
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
    pub name: String,
    pub metadata: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameSetup {
    pub options: Options,
    pub player_names: Vec<String>,
    pub seed: String,
    pub deck: Option<Vec<DeckCard>>,
    pub characters: Option<Vec<AssignedCharacter>>,
    #[serde(default)]
    pub interpretation: Interpretation,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlayerAction {
    #[serde(rename = "type")]
    pub action_type: i32,
    pub target: i32,
    pub value: i32,
}
pub type RecordedAction = PlayerAction;
impl From<&hanabi_protocol::ReplayAction> for PlayerAction {
    fn from(a: &hanabi_protocol::ReplayAction) -> Self {
        Self {
            action_type: i32::from(a.kind),
            target: a.target,
            value: a.value,
        }
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
pub fn clue_type(action_type: i32) -> Option<ClueType> {
    match ActionType::try_from(action_type) {
        Ok(ActionType::ColorClue) => Some(ClueType::Color),
        Ok(ActionType::RankClue) => Some(ClueType::Rank),
        _ => None,
    }
}

/// The recorded action type that gives a kind of clue.
pub fn clue_action_type(clue_type: ClueType) -> i32 {
    i32::from(match clue_type {
        ClueType::Color => ActionType::ColorClue,
        ClueType::Rank => ActionType::RankClue,
    })
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
    Strike {
        num: i32,
        turn: i32,
        order: usize,
    },
    Status {
        clues: i32,
        score: i32,
        max_score: i32,
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineState {
    pub options: Options,
    pub seed: String,
    pub interpretation: Interpretation,
    pub players: Vec<EnginePlayer>,
    pub deck: Vec<EngineCard>,
    pub deck_index: usize,
    pub stacks: Vec<i32>,
    pub stack_starts: Vec<i32>,
    pub play_stack_directions: Vec<i32>,
    pub turn: i32,
    pub turns_inverted: bool,
    pub active_player_index: usize,
    pub clue_tokens: i32,
    pub score: i32,
    pub max_score: i32,
    pub strikes: i32,
    pub last_clue_type_given: i32,
    pub end_condition: EndCondition,
    pub end_player: i32,
    pub end_turn: i32,
    pub started_timer: bool,
    pub paused: bool,
    pub events: Vec<EngineEvent>,
    pub actions: Vec<RecordedAction>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Transition {
    pub state: EngineState,
    pub events: Vec<EngineEvent>,
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
    pub player_index: i32,
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
