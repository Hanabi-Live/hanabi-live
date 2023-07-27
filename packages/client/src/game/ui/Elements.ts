import { Suit } from "@hanabi/data";
import Konva from "konva";
import { ButtonGroup } from "./ButtonGroup";
import { CardLayout } from "./CardLayout";
import { ClueLog } from "./ClueLog";
import { ColorButton } from "./ColorButton";
import { Arrow } from "./controls/Arrow";
import { Button } from "./controls/Button";
import { CheckButton } from "./controls/CheckButton";
import { CurrentPlayerArea } from "./controls/CurrentPlayerArea";
import { EnterHypoButton } from "./controls/EnterHypoButton";
import { FitText } from "./controls/FitText";
import { SharedTurnsButton } from "./controls/SharedTurnsButton";
import { Shuttle } from "./controls/Shuttle";
import { SlidableGroup } from "./controls/SlidableGroup";
import { StrikeSquare } from "./controls/StrikeSquare";
import { StrikeX } from "./controls/StrikeX";
import { TextWithTooltip } from "./controls/TextWithTooltip";
import { TimerDisplay } from "./controls/TimerDisplay";
import { Deck } from "./Deck";
import { FullActionLog } from "./FullActionLog";
import { MultiFitText } from "./MultiFitText";
import { NameFrame } from "./NameFrame";
import { PlayStack } from "./PlayStack";
import { RankButton } from "./RankButton";

export class Elements {
  // The main screen
  stageFade: Konva.Rect | null = null;
  playArea: Konva.Rect | null = null;

  playStacks = new Map<Suit | "hole", PlayStack>();

  /**
   * UI row below play stacks, usually used for information about the suits, but also for stack
   * directions in "Up Or Down" or "Reversed" variants as well as starting values and played cards
   * in Sudoku variants.
   */
  suitLabelTexts: FitText[] = [];
  discardArea: Konva.Rect | null = null;
  discardStacks = new Map<Suit, CardLayout>();
  playerHands: CardLayout[] = [];
  playerHandTurnRects: Konva.Rect[] = [];
  playerHandBlackLines: Konva.Rect[] = [];
  nameFrames: NameFrame[] = [];
  actionLog: MultiFitText | null = null;
  replayButton: Button | null = null;
  chatButton: Button | null = null;
  lobbyButton: Button | null = null;
  restartButton: Button | null = null;
  deck: Deck | null = null;
  gameIDLabel: FitText | null = null;
  gameInfoImage: Konva.Image | null = null;
  deckTurnsRemainingLabel1: Konva.Text | null = null;
  deckTurnsRemainingLabel2: Konva.Text | null = null;
  deckPlayAvailableLabel: Konva.Rect | null = null;
  variantLabel: FitText | null = null;
  variantUnderline: Konva.Line | null = null;

  // Extra elements on the right-hand side + the bottom.
  clueLog: ClueLog | null = null;
  paceNumberLabel: Konva.Text | null = null;
  efficiencyNumberLabel: TextWithTooltip | null = null;
  efficiencyPipeLabel: Konva.Text | null = null;
  efficiencyMinNeededLabel: Konva.Text | null = null;
  noDiscardBorder: Konva.Rect | null = null;
  noDoubleDiscardBorder: Konva.Rect | null = null;

  // The score area
  scoreArea: Konva.Group | null = null;
  scoreAreaBorder: Konva.Rect | null = null;
  turnNumberLabel: TextWithTooltip | null = null;
  scoreTextLabel: Konva.Text | null = null;
  scoreNumberLabel: Konva.Text | null = null;
  maxScoreNumberLabel: Konva.Text | null = null;
  playsTextLabel: Konva.Text | null = null;
  playsNumberLabel: Konva.Text | null = null;
  cluesNumberLabel: Konva.Text | null = null;
  cluesNumberLabelPulse: Konva.Tween | null = null;
  strikeSquares: StrikeSquare[] = [];
  strikeXs: StrikeX[] = [];
  questionMarkLabels: Konva.Text[] = [];
  terminateButton: Button | null = null;

  // Next to the score area.
  spectatorsLabel: Konva.Image | null = null;
  spectatorsNumLabel: Konva.Text | null = null;
  sharedReplayLeaderLabel: Konva.Image | null = null;
  sharedReplayLeaderCircle: Konva.Circle | null = null;
  sharedReplayLeaderLabelPulse: Konva.Tween | null = null;
  yourTurn: Konva.Group | null = null;

  // The clue UI
  clueArea: Konva.Group | null = null;
  clueTargetButtonGroup: ButtonGroup | null = null;
  clueTargetButtonGroup2: ButtonGroup | null = null; // For hypotheticals
  lowerClueArea: SlidableGroup | null = null;
  clueTypeButtonGroup: ButtonGroup | null = null;
  rankClueButtons: RankButton[] = [];
  colorClueButtons: ColorButton[] = [];
  giveClueButton: Button | null = null;
  clueAreaDisabled: SlidableGroup | null = null;

  // The current turn UI.
  currentPlayerArea: CurrentPlayerArea | null = null;

  // The replay screen
  replayArea: Konva.Group | null = null;
  replayBar: Konva.Rect | null = null;
  replayShuttleShared: Shuttle | null = null;
  replayShuttle: Shuttle | null = null;
  replayBackFullButton: Button | null = null;
  replayBackButton: Button | null = null;
  replayForwardButton: Button | null = null;
  replayForwardFullButton: Button | null = null;
  replayExitButton: Button | null = null;
  pauseSharedTurnsButton: SharedTurnsButton | null = null;
  useSharedTurnsButton: SharedTurnsButton | null = null;
  enterHypoButton: EnterHypoButton | null = null;
  hypoCircle: Konva.Group | null = null;
  hypoButtonsArea: Konva.Group | null = null;
  editCardsButton: CheckButton | null = null;
  hypoBackButton: Button | null = null;
  toggleDrawnCardsButton: CheckButton | null = null;
  endHypotheticalButton: Button | null = null;

  // The pause screen
  pauseArea: Konva.Group | null = null;
  pauseText: Konva.Text | null = null;
  pauseButton: Button | null = null;

  // The restart screen
  restartArea: Konva.Group | null = null;
  restartText: Konva.Text | null = null;

  // Other screens
  fullActionLog: FullActionLog | null = null;

  // Other conditional elements
  arrows: Arrow[] = [];
  timer1Circle: Konva.Ellipse | null = null;
  timer1: TimerDisplay | null = null;
  timer2: TimerDisplay | null = null;
  premoveCancelButton: Button | null = null;
  sharedReplayForward: Konva.Image | null = null;
  sharedReplayForwardTween: Konva.Tween | null = null;
  sharedReplayBackward: Konva.Image | null = null;
  sharedReplayBackwardTween: Konva.Tween | null = null;
}
