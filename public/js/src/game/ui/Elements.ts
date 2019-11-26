
// Imports
import Konva from 'konva';
import Arrow from './Arrow';
import Button from './Button';
import ButtonGroup from './ButtonGroup';
import ClickArea from './ClickArea';
import ColorButton from './ColorButton';
import CurrentPlayerArea from './CurrentPlayerArea';
import FitText from './FitText';
import RankButton from './RankButton';
import Shuttle from './Shuttle';
import StrikeSquare from './StrikeSquare';
import StrikeX from './StrikeX';
import Suit from '../../Suit';
import TimerDisplay from './TimerDisplay';

export default class Elements {
    // The main screen
    stageFade: Konva.Rect | null = null;
    playArea: ClickArea | null = null;
    playStacks: Map<Suit, any> = new Map(); // TODO set to PlayStack
    suitLabelTexts: Array<FitText> = [];
    discardArea: ClickArea | null = null;
    discardStacks: Map<Suit, any> = new Map(); // TODO set to CardLayout
    playerHands: Array<any> = []; // TODO set to CardLayout
    nameFrames: Array<any> = []; // TODO set to NameFrame
    actionLog: any = null; // TODO set to MultiFitText
    replayButton: Button | null = null;
    chatButton: Button | null = null;
    lobbyButtonSmall: Button | null = null;
    lobbyButtonBig: Button | null = null;
    killButton: Button | null = null;
    restartButton: Button | null = null;
    endHypotheticalButton: Button | null = null;
    deck: any = null; // TODO set to Deck
    gameIDLabel: FitText | null = null;
    deckTurnsRemainingLabel1: Konva.Text | null = null;
    deckTurnsRemainingLabel2: Konva.Text | null = null;
    deckPlayAvailableLabel: Konva.Rect | null = null;

    // Extra elements on the right-hand side + the bottom
    clueLog: any; // TODO set to ClueLog
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
    cluesNumberLabel: Konva.Text | null = null;
    cluesNumberLabelPulse: Konva.Tween | null = null;
    strikeXs: Array<StrikeX> = [];
    strikeSquares: Array<StrikeSquare> = [];
    spectatorsLabel: Konva.Image | null = null;
    spectatorsNumLabel: Konva.Text | null = null;
    sharedReplayLeaderLabel: Konva.Image | null = null;
    sharedReplayLeaderCircle: Konva.Circle | null = null;
    sharedReplayLeaderLabelPulse: Konva.Tween | null = null;

    // The clue UI
    clueArea: Konva.Group | null = null;
    clueTargetButtonGroup: ButtonGroup | null = null;
    clueTypeButtonGroup: ButtonGroup | null = null;
    rankClueButtons: Array<RankButton> = [];
    colorClueButtons: Array<ColorButton> = [];
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
    pauseSharedTurnsButton: Button | null = null;
    useSharedTurnsButton: Button | null = null;
    enterHypoButton: Button | null = null;
    hypoCircle: Konva.Group | null = null;

    // The pause screen
    pauseArea: Konva.Group | null = null;
    pauseText: Konva.Text | null = null;
    pauseButton: Button | null = null;

    // Other screens
    fullActionLog: any = null; // TODO set to FullActionLog

    // Other conditional elements
    arrows: Array<Arrow> = [];
    timer1Circle: Konva.Ellipse | null = null;
    timer1: TimerDisplay | null = null;
    timer2: TimerDisplay | null = null;
    premoveCancelButton: Button | null = null;
    sharedReplayForward: Konva.Image | null = null;
    sharedReplayForwardTween: Konva.Tween | null = null;
    sharedReplayBackward: Konva.Image | null = null;
    sharedReplayBackwardTween: Konva.Tween | null = null;
}
