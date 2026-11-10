import type { Suit } from "@hanabi-live/game";
import type Konva from "konva";
import type { ActionLog } from "./ActionLog";
import type { ButtonGroup } from "./ButtonGroup";
import type { CardLayout } from "./CardLayout";
import type { ColorButton } from "./ColorButton";
import type { Deck } from "./Deck";
import type { FullActionLog } from "./FullActionLog";
import type { NameFrame } from "./NameFrame";
import type { PlayStack } from "./PlayStack";
import type { RankButton } from "./RankButton";
import type { TerminateMenu } from "./TerminateMenu";
import type { Arrow } from "./controls/Arrow";
import type { Button } from "./controls/Button";
import type { CurrentPlayerArea } from "./controls/CurrentPlayerArea";
import type { EnterHypoButton } from "./controls/EnterHypoButton";
import type { FitText } from "./controls/FitText";
import type { SharedTurnsButton } from "./controls/SharedTurnsButton";
import type { Shuttle } from "./controls/Shuttle";
import type { SlidableGroup } from "./controls/SlidableGroup";
import type { StrikeSquare } from "./controls/StrikeSquare";
import type { StrikeX } from "./controls/StrikeX";
import type { TextWithTooltip } from "./controls/TextWithTooltip";
import type { TimerDisplay } from "./controls/TimerDisplay";
import type { ToggleButton } from "./controls/ToggleButton";

export class Elements {
  // The main screen
  stageFade: Konva.Rect | undefined = undefined;
  playArea: Konva.Rect | undefined = undefined;

  playStacks = new Map<Suit | "hole", PlayStack>();
  /** For "Throw It in a Hole" variants. */
  holeCounter: Konva.Group | undefined = undefined;
  holeCountLabel: Konva.Text | undefined = undefined;

  /**
   * UI row below play stacks, usually used for information about the suits, but also for stack
   * directions in "Up Or Down" or "Reversed" variants as well as starting values and played cards
   * in Sudoku variants.
   */
  suitLabelTexts: FitText[] = [];

  discardArea: Konva.Rect | undefined = undefined;
  discardStacks = new Map<Suit, CardLayout>();
  playerHands: CardLayout[] = [];
  playerHandTurnRects: Konva.Rect[] = [];
  playerHandBlackLines: Konva.Rect[] = [];
  nameFrames: NameFrame[] = [];
  actionLog: ActionLog | undefined = undefined;
  replayButton: Button | undefined = undefined;
  newUIButton: Button | undefined = undefined;
  chatButton: Button | undefined = undefined;
  lobbyButton: Button | undefined = undefined;
  restartButton: Button | undefined = undefined;
  restartReadyButton: ToggleButton | undefined = undefined;
  deck: Deck | undefined = undefined;
  gameIDLabel: FitText | undefined = undefined;
  gameInfoImage: Konva.Image | undefined = undefined;
  deckTurnsRemainingLabel1: Konva.Text | undefined = undefined;
  deckTurnsRemainingLabel2: Konva.Text | undefined = undefined;
  deckPlayAvailableLabel: Konva.Rect | undefined = undefined;
  variantLabel: FitText | undefined = undefined;
  variantUnderline: Konva.Line | undefined = undefined;

  // Extra elements on the right-hand side + the bottom.
  paceNumberLabel: Konva.Text | undefined = undefined;
  efficiencyNumberLabel: TextWithTooltip | undefined = undefined;
  efficiencyPipeLabel: Konva.Text | undefined = undefined;
  efficiencyMinNeededLabel: Konva.Text | undefined = undefined;
  noDiscardBorder: Konva.Rect | undefined = undefined;
  noDoubleDiscardBorder: Konva.Rect | undefined = undefined;

  // The score area
  scoreArea: Konva.Group | undefined = undefined;
  scoreAreaBorder: Konva.Rect | undefined = undefined;
  turnNumberLabel: TextWithTooltip | undefined = undefined;
  scoreTextLabel: Konva.Text | undefined = undefined;
  scoreNumberLabel: Konva.Text | undefined = undefined;
  maxScoreNumberLabel: Konva.Text | undefined = undefined;
  playsTextLabel: Konva.Text | undefined = undefined;
  playsNumberLabel: Konva.Text | undefined = undefined;
  cluesNumberLabel: Konva.Text | undefined = undefined;
  cluesNumberLabelPulse: Konva.Tween | undefined = undefined;
  strikeSquares: StrikeSquare[] = [];
  strikeXs: StrikeX[] = [];
  questionMarkLabels: Konva.Text[] = [];
  terminateButton: Button | undefined = undefined;
  terminateMenu: TerminateMenu | undefined = undefined;

  // Next to the score area.
  spectatorsLabel: Konva.Image | undefined = undefined;
  spectatorsNumLabel: Konva.Text | undefined = undefined;
  sharedReplayLeaderLabel: Konva.Image | undefined = undefined;
  sharedReplayLeaderCircle: Konva.Circle | undefined = undefined;
  sharedReplayLeaderLabelPulse: Konva.Tween | undefined = undefined;
  yourTurn: Konva.Group | undefined = undefined;

  // The clue UI
  clueArea: Konva.Group | undefined = undefined;
  clueTargetButtonGroup: ButtonGroup | undefined = undefined;
  clueTargetButtonGroup2: ButtonGroup | undefined = undefined; // For hypotheticals
  lowerClueArea: SlidableGroup | undefined = undefined;
  clueTypeButtonGroup: ButtonGroup | undefined = undefined;
  rankClueButtons: RankButton[] = [];
  colorClueButtons: ColorButton[] = [];
  giveClueButton: Button | undefined = undefined;
  postClueEmpathyButton: ToggleButton | undefined = undefined;
  clueAreaDisabled: SlidableGroup | undefined = undefined;
  waitingOnServer: Konva.Group | undefined = undefined;
  waitingOnServerAnimation: Konva.Animation | undefined = undefined;

  // The current turn UI.
  currentPlayerArea: CurrentPlayerArea | undefined = undefined;

  // The replay screen
  replayArea: Konva.Group | undefined = undefined;
  replayBar: Konva.Rect | undefined = undefined;
  replayShuttleShared: Shuttle | undefined = undefined;
  replayShuttle: Shuttle | undefined = undefined;
  replayBackFullButton: Button | undefined = undefined;
  replayBackButton: Button | undefined = undefined;
  replayForwardButton: Button | undefined = undefined;
  replayForwardFullButton: Button | undefined = undefined;
  replayExitButton: Button | undefined = undefined;
  pauseSharedTurnsButton: SharedTurnsButton | undefined = undefined;
  useSharedTurnsButton: SharedTurnsButton | undefined = undefined;
  enterHypoButton: EnterHypoButton | undefined = undefined;
  hypoCircle: Konva.Group | undefined = undefined;
  hypoPauseSharedTurnsButton: Button | undefined = undefined;
  hypoButtonsArea: Konva.Group | undefined = undefined;
  editCardsButton: ToggleButton | undefined = undefined;
  hypoBackButton: Button | undefined = undefined;
  hypoPassTurnButton: Button | undefined = undefined;
  toggleDrawnCardsButton: ToggleButton | undefined = undefined;
  endHypotheticalButton: Button | undefined = undefined;

  // The pause screen
  pauseArea: Konva.Group | undefined = undefined;
  pauseText: Konva.Text | undefined = undefined;
  pauseButton: Button | undefined = undefined;

  // The restart screen
  restartArea: Konva.Group | undefined = undefined;
  restartText: Konva.Text | undefined = undefined;
  restartGameButton: Button | undefined = undefined;
  restartTableButton: Button | undefined = undefined;
  restartContents: Konva.Group | undefined = undefined;
  restartWaitingOnServer: Konva.Group | undefined = undefined;
  restartWaitingOnServerAnimation: Konva.Animation | undefined = undefined;

  // Other screens
  fullActionLog: FullActionLog | undefined = undefined;

  // Other conditional elements
  arrows: Arrow[] = [];
  timer1Circle: Konva.Ellipse | undefined = undefined;
  timer1: TimerDisplay | undefined = undefined;
  timer2: TimerDisplay | undefined = undefined;
  premoveCancelButton: Button | undefined = undefined;
  sharedReplayForward: Konva.Image | undefined = undefined;
  sharedReplayForwardTween: Konva.Tween | undefined = undefined;
  sharedReplayBackward: Konva.Image | undefined = undefined;
  sharedReplayBackwardTween: Konva.Tween | undefined = undefined;
}
