
// Imports
import Konva from 'konva';
import Button from './Button';
import StrikeSquare from './StrikeSquare';
import StrikeX from './StrikeX';
import Suit from '../../Suit';

export default class Elements {
    // The main screen
    stageFade: Konva.Rect | null = null;
    playArea: Konva.Rect | null = null;
    playStacks: Map<Suit, any> = new Map(); // TODO set to CardStack
    suitLabelTexts: Array<any> = []; // TODO set to FitText
    discardArea: Konva.Rect | null = null;
    discardStacks: Map<Suit, any> = new Map(); // TODO set to CardStack
    playerHands: Array<any> = []; // TODO set to CardLayout
    nameFrames: Array<any> = []; // TODO set to NameFrame
    actionLog: any = null; // TODO set to MultiFitText
    replayButton: any = null; // TODO set to Button
    chatButton: any = null; // TODO set to Button
    lobbyButtonSmall: any = null; // TODO set to Button
    lobbyButtonBig: any = null; // TODO set to Button
    killButton: any = null; // TODO set to Button
    restartButton: any = null; // TODO set to Button
    endHypotheticalButton: any = null; // TODO set to Button
    deck: any = null; // TODO set to Deck
    gameIDLabel: any = null; // TODO set to FitText
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
    clueTargetButtonGroup: any = null; // TODO set to ButtonGroup
    clueTypeButtonGroup: any = null; // TODO set to ButtonGroup
    rankClueButtons: any = null; // TODO set to NumberButton
    colorClueButtons: any = null; // TODO set to ColorButton
    giveClueButton: any = null; // TODO set to Button
    clueAreaDisabled: Konva.Group | null = null;

    // The current turn UI
    currentPlayerArea: any = null; // TODO set to Konva.Group | null
    currentPlayerRect1: Konva.Rect | null = null;
    currentPlayerText1: any = null; // TODO set to FitText
    currentPlayerText2: any = null; // TODO set to FitText
    currentPlayerText3: any = null; // TODO set to FitText
    currentPlayerArrow: Konva.Group | null = null;
    currentPlayerArrowTween: Konva.Tween | null = null;

    // The replay screen
    replayArea: Konva.Group | null = null;
    replayBar: Konva.Rect | null = null;
    replayShuttleShared: Konva.Rect | null = null;
    replayShuttle: Konva.Rect | null = null;
    replayBackFullButton: any = null; // TODO set to Button
    replayBackButton: any = null; // TODO set to Button
    replayForwardButton: any = null; // TODO set to Button
    replayForwardFullButton: any = null; // TODO set to Button
    replayExitButton: any = null; // TODO set to Button
    pauseSharedTurnsButton: any = null; // TODO set to Button
    useSharedTurnsButton: any = null; // TODO set to Button
    enterHypoButton: any = null; // TODO set to Button
    hypoCircle: Konva.Group | null = null;

    // The pause screen
    pauseArea: Konva.Group | null = null;
    pauseText: Konva.Text | null = null;
    pauseButton: any = null; // TODO set to Button

    // Other screens
    fullActionLog: any = null; // TODO set to FullActionLog

    // Other conditional elements
    arrows: Array<any> = []; // TODO set to Array<Arrow>
    timer1Circle: Konva.Ellipse | null = null;
    timer1: any = null; // TODO set to TimerDisplay
    timer2: any = null; // TODO set to TimerDisplay
    premoveCancelButton: Button | null = null;
    sharedReplayForward: Konva.Image | null = null;
    sharedReplayForwardTween: Konva.Tween | null = null;
    sharedReplayBackward: Konva.Image | null = null;
    sharedReplayBackwardTween: Konva.Tween | null = null;
}
