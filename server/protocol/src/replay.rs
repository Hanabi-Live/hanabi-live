//! Replays: imported games and the controls of shared replays.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

/// A game in the replay format, which the server exports and imports, and which clients copy and
/// paste. Every field is optional when importing: a seed alone determines the deck, and missing
/// options take their defaults. The server checks the game itself, such as whether the deck matches
/// the seed.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayGame {
    /// Empty takes the player count from the seed and names the players "Alice", "Bob", and so on.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(length(max = MAX_PLAYERS))]
    pub player_names: Vec<String>,
    /// The deck, by card order. Empty deals the seed's deck.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(length(max = MAX_DECK_SIZE))]
    pub deck: Vec<CardIdentity>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(length(max = MAX_GAME_ACTIONS))]
    pub actions: Vec<ReplayGameAction>,
    #[serde(default, skip_serializing_if = "is_default")]
    pub options: GameOptions,
    /// Each player's notes.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(with = "Vec<Notes>", length(max = MAX_PLAYERS))]
    pub notes: Vec<Vec<String>>,
    /// One for each player when `detrimentalCharacters` is on, and empty otherwise. Empty with the
    /// option on deals them from the seed.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(length(max = MAX_PLAYERS))]
    pub characters: Vec<CharacterAssignment>,
    /// Absent for a game with its own deck instead of a seed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<Seed>,
}

/// Whether every option is the default, so that the replay format omits them.
fn is_default(options: &GameOptions) -> bool {
    *options == GameOptions::default()
}

/// The card that an action names, such as the card that a turn plays.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TargetCard {
    pub order: CardOrder,
}

/// A clue that a turn gives.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClueTurn {
    /// The player who receives the clue.
    pub receiver_index: PlayerIndex,
    pub clue: Clue,
}

/// The end of a game in the replay format.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameOverTurn {
    pub end_condition: EndCondition,
    /// The player who ended the game, such as the one who timed out. Absent when no player did.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_index: Option<PlayerIndex>,
}

/// What a player does on their turn: the `playerAction` command, and the turns of the replay format.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PlayerAction {
    Play(TargetCard),
    Discard(TargetCard),
    Clue(ClueTurn),
}

/// A turn, or the end of the game, in the replay format.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ReplayGameAction {
    Play(TargetCard),
    Discard(TargetCard),
    Clue(ClueTurn),
    GameOver(GameOverTurn),
}

impl ReplayGameAction {
    /// The player's action of a turn, or else the end of the game.
    pub const fn turn(self) -> Result<PlayerAction, GameOverTurn> {
        match self {
            Self::Play(card) => Ok(PlayerAction::Play(card)),
            Self::Discard(card) => Ok(PlayerAction::Discard(card)),
            Self::Clue(clue) => Ok(PlayerAction::Clue(clue)),
            Self::GameOver(end) => Err(end),
        }
    }
}

impl From<PlayerAction> for ReplayGameAction {
    fn from(action: PlayerAction) -> Self {
        match action {
            PlayerAction::Play(card) => Self::Play(card),
            PlayerAction::Discard(card) => Self::Discard(card),
            PlayerAction::Clue(clue) => Self::Clue(clue),
        }
    }
}

/// What a shared-replay arrow points at: a card, or a part of the board.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ReplayArrowTarget {
    Card { order: CardOrder },
    Board { element: ReplayBoardElement },
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
#[serde(rename_all = "camelCase")]
pub enum ReplaySoundEffect {
    Buzz,
    Clap,
    Holy,
    Nooo,
}

/// The seats of the players in a shared replay who will not play again if the leader restarts.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRestartDeclined {
    pub table_id: TableId,
    #[schemars(length(max = MAX_PLAYERS))]
    pub restart_declined: Vec<PlayerIndex>,
}

/// A spectator suggesting a turn to the shared replay's leader.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSuggestion {
    pub table_id: TableId,
    pub username: Username,
    pub turn: Turn,
}

/// The hypothetical that a shared replay plays through.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActiveHypothetical {
    pub show_drawn_cards: bool,
    /// The hypothetical's events so far, in order.
    pub events: Vec<HypotheticalEvent>,
}

/// A card that a hypothetical shows as another identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MorphedCard {
    pub order: CardOrder,
    pub identity: MorphedIdentity,
}

/// The identity that a hypothetical shows a card as. A player can name only its suit or only its
/// rank, so each is absent when the player leaves it unknown.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MorphedIdentity {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suit_index: Option<SuitIndex>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rank: Option<CardRank>,
}

/// One event in a hypothetical. The server relays these; each client applies them to its own copy
/// of the game.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HypotheticalEvent {
    Draw(CardEvent),
    Play(CardEvent),
    Discard(CardEvent),
    /// A play that fails, which discards the card and adds a strike.
    Misplay(CardEvent),
    Clue(ClueEvent),
    Turn(TurnEvent),
    /// Shows a card as another identity.
    Morph(MorphedCard),
    /// Shows a morphed card as its original identity again.
    Unmorph(TargetCard),
}
