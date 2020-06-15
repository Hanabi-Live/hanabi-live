// Imports
import Konva from 'konva';
import Suit from '../types/Suit';
import Arrow from './Arrow';
import Button from './Button';
import ButtonGroup from './ButtonGroup';
import CardLayout from './CardLayout';
import ClickArea from './ClickArea';
import ClueLog from './ClueLog';
import ColorButton from './ColorButton';
import CurrentPlayerArea from './CurrentPlayerArea';
import Deck from './Deck';
import FitText from './FitText';
import FullActionLog from './FullActionLog';
import MultiFitText from './MultiFitText';
import NameFrame from './NameFrame';
import PlayStack from './PlayStack';
import RankButton from './RankButton';
import SharedTurnsButton from './SharedTurnsButton';
import Shuttle from './Shuttle';
import StrikeSquare from './StrikeSquare';
import StrikeX from './StrikeX';
import ThreeLineButton from './ThreeLineButton';
import TimerDisplay from './TimerDisplay';

export default class Elements {
  // The main screen
  stageFade: Konva.Rect | null = null;
  playArea: ClickArea | null = null;
  playStacks: Map<Suit | 'hole', PlayStack> = new Map<Suit | 'hole', PlayStack>();
  suitLabelTexts: FitText[] = [];
  discardArea: ClickArea | null = null;
  discardStacks: Map<Suit, CardLayout> = new Map<Suit, CardLayout>();
  playerHands: CardLayout[] = [];
  playerHandTurnRects: Konva.Rect[] = [];
  nameFrames: NameFrame[] = [];
  actionLog: MultiFitText | null = null;
  replayButton: Button | null = null;
  chatButton: Button | null = null;
  lobbyButtonSmall: Button | null = null;
  lobbyButtonBig: Button | null = null;
  killButton: Button | null = null;
  restartButton: Button | null = null;
  endHypotheticalButton: Button | null = null;
  deck: Deck | null = null;
  gameIDLabel: FitText | null = null;
  deckTurnsRemainingLabel1: Konva.Text | null = null;
  deckTurnsRemainingLabel2: Konva.Text | null = null;
  deckPlayAvailableLabel: Konva.Rect | null = null;

  // Extra elements on the right-hand side + the bottom
  clueLog: ClueLog | null = null;
  paceNumberLabel: Konva.Text | null = null;
  efficiencyNumberLabel: Konva.Text | null = null;
  efficiencyNumberLabelMinNeeded: Konva.Text | null = null;
  noDiscardBorder: Konva.Rect | null = null;
  noDoubleDiscardBorder: Konva.Rect | null = null;
  noClueBorder: Konva.Rect | null = null;
  scoreArea: Konva.Group | null = null;
  turnNumberLabel: Konva.Text | null = null;
  scoreNumberLabel: Konva.Text | null = null;
  maxScoreNumberLabel: Konva.Text | null = null;
  playsNumberLabel: Konva.Text | null = null;
  cluesNumberLabel: Konva.Text | null = null;
  cluesNumberLabelPulse: Konva.Tween | null = null;
  strikeXs: StrikeX[] = [];
  strikeSquares: StrikeSquare[] = [];
  spectatorsLabel: Konva.Image | null = null;
  spectatorsNumLabel: Konva.Text | null = null;
  sharedReplayLeaderLabel: Konva.Image | null = null;
  sharedReplayLeaderCircle: Konva.Circle | null = null;
  sharedReplayLeaderLabelPulse: Konva.Tween | null = null;
  yourTurn: Konva.Group | null = null;

  // The clue UI
  clueArea: Konva.Group | null = null;
  clueTargetButtonGroup: ButtonGroup | null = null;
  clueTargetButtonGroup2: ButtonGroup | null = null;
  clueTypeButtonGroup: ButtonGroup | null = null;
  rankClueButtons: RankButton[] = [];
  colorClueButtons: ColorButton[] = [];
  giveClueButton: Button | null = null;
  clueAreaDisabled: Konva.Group | null = null;

  // The current turn UI
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
  enterHypoButton: Button | null = null;
  hypoCircle: Konva.Group | null = null;
  hypoBackButton: Button | null = null;
  toggleRevealedButton: ThreeLineButton | null = null;

  // The pause screen
  pauseArea: Konva.Group | null = null;
  pauseText: Konva.Text | null = null;
  pauseButton: Button | null = null;

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
