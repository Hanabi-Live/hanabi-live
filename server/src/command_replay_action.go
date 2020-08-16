package main

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
)

var (
	replayActionFunctions map[int]func(*Session, *CommandData, *Table)
	actionTypeTurnRegExp  = regexp.MustCompile(`"type":\s*"turn"`)
)

func replayActionsFunctionsInit() {
	replayActionFunctions = map[int]func(*Session, *CommandData, *Table){
		ReplayActionTypeSegment:        commandReplayActionSegment,
		ReplayActionTypeArrow:          commandReplayActionArrow,
		ReplayActionTypeSound:          commandReplayActionSound,
		ReplayActionTypeHypoStart:      commandReplayActionHypoStart,
		ReplayActionTypeHypoEnd:        commandReplayActionHypoEnd,
		ReplayActionTypeHypoAction:     commandReplayActionHypoAction,
		ReplayActionTypeHypoBack:       commandReplayActionHypoBack,
		ReplayActionTypeToggleRevealed: commandReplayActionToggleRevealed,
	}
}

// commandReplayAction is sent when the user performs an action in a shared replay
//
// Example data:
// {
//   tableID: 5,
//   type: 0, // Types are listed in the "constants.go" file
//   value: 10, // Optional
//   name: 'Alice', // Optional
// }
func commandReplayAction(s *Session, d *CommandData) {
	/*
		Validate
	*/

	t, exists := getTable(s, d.TableID)
	if !exists {
		return
	}

	t.Mutex.Lock()
	defer t.Mutex.Unlock()
	if t.Deleted {
		return
	}

	// Validate that this is a shared replay
	if !t.Replay || !t.Visible {
		s.Warning("Table " + strconv.FormatUint(t.ID, 10) + " is not a shared replay, " +
			"so you cannot send a shared replay action.")
		return
	}

	// Validate that this person is spectating the shared replay
	j := t.GetSpectatorIndexFromID(s.UserID())
	if j < -1 {
		s.Warning("You are not in shared replay " + strconv.FormatUint(t.ID, 10) + ".")
	}

	// Validate that this person is leading the shared replay
	if s.UserID() != t.Owner {
		s.Warning("You cannot send a shared replay action unless you are the leader.")
		return
	}

	/*
		Replay action
	*/

	// Start the idle timeout
	go t.CheckIdle()

	// Do different tasks depending on the action
	if replayActionFunction, ok := replayActionFunctions[d.Type]; ok {
		replayActionFunction(s, d, t)
	} else {
		s.Warning("That is not a valid replay action type.")
		return
	}
}

func commandReplayActionSegment(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	// Change the segment
	// (we borrow the turn variable to use as a stand-in for the current shared replay segment)
	g.Turn = d.Segment

	// Notify everyone
	type ReplaySegmentMessage struct {
		TableID uint64 `json:"tableID"`
		Segment int    `json:"segment"`
	}
	replaySegmentMessage := &ReplaySegmentMessage{
		TableID: t.ID,
		Segment: d.Segment,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("replaySegment", replaySegmentMessage)
	}

	// Update the progress
	progressFloat := float64(g.Turn) / float64(g.EndTurn) * 100 // In percent
	progress := int(math.Round(progressFloat))
	if progress > 100 {
		// The server has no notion of game segments, it knows about the total number of turns
		// (e.g. some detrimental characters can take two actions on the same turn)
		// Thus, since turn is being used as a stand-in for segment,
		// it is possible to go past the last turn
		// (since the segment number only indirectly corresponds to the turn number)
		progress = 100
	} else if progress < 0 {
		// This can happen if the end turn is 0
		progress = 0
	}
	oldProgress := t.Progress
	if progress != oldProgress {
		t.Progress = progress
		t.NotifyProgress()
	}
}

func commandReplayActionArrow(s *Session, d *CommandData, t *Table) {
	// Display an arrow to indicate a specific card that the shared replay leader wants to draw
	// attention to
	type ReplayIndicatorMessage struct {
		TableID uint64 `json:"tableID"`
		Order   int    `json:"order"`
	}
	replayIndicatorMessage := &ReplayIndicatorMessage{
		TableID: t.ID,
		Order:   d.Order,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("replayIndicator", replayIndicatorMessage)
	}
}

func commandReplayActionSound(s *Session, d *CommandData, t *Table) {
	// Play a sound effect
	type ReplaySoundMessage struct {
		TableID uint64 `json:"tableID"`
		Sound   string `json:"sound"`
	}
	replaySoundMessage := &ReplaySoundMessage{
		TableID: t.ID,
		Sound:   d.Sound,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("replaySound", replaySoundMessage)
	}
}

func commandReplayActionHypoStart(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	if g.Hypothetical {
		s.Warning("You are already in a hypothetical, so you cannot start a new one.")
		return
	}

	// Start a hypothetical line
	g.Hypothetical = true

	type HypoStartMessage struct {
		TableID uint64
	}
	hypoStartMessage := &HypoStartMessage{
		TableID: t.ID,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("hypoStart", hypoStartMessage)
	}
}

func commandReplayActionHypoEnd(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	if !g.Hypothetical {
		s.Warning("You are not in a hypothetical, so you cannot end one.")
		return
	}

	// End a hypothetical line
	g.Hypothetical = false
	g.HypoActions = make([]string, 0)

	type HypoEndMessage struct {
		TableID uint64
	}
	hypoEndMessage := &HypoEndMessage{
		TableID: t.ID,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("hypoEnd", hypoEndMessage)
	}
}

func commandReplayActionHypoAction(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	// Validate that the submitted action is not empty
	if d.ActionJSON == "" {
		s.Warning("The action JSON cannot be blank.")
		return
	}

	// Test to see if it is valid JSON
	var js json.RawMessage
	if json.Unmarshal([]byte(d.ActionJSON), &js) != nil {
		s.Warning("That is not a valid JSON object.")
		return
	}

	// Perform a move in the hypothetical
	g.HypoActions = append(g.HypoActions, d.ActionJSON)

	for _, sp := range t.Spectators {
		sp.Session.Emit("hypoAction", d.ActionJSON)
	}
}

func commandReplayActionHypoBack(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	// The replay leader wants to go back one turn in the hypothetical
	if len(g.HypoActions) == 0 {
		return
	}

	// Starting from the end,
	// remove hypothetical actions until we get to the 2nd to last "turn" action
	for {
		// Delete the final element in the slice
		g.HypoActions = g.HypoActions[:len(g.HypoActions)-1]
		if len(g.HypoActions) == 0 {
			break
		}

		lastActionString := g.HypoActions[len(g.HypoActions)-1]
		match := actionTypeTurnRegExp.FindStringSubmatch(lastActionString)
		if match != nil {
			break
		}
	}

	type HypoBackMessage struct {
		TableID uint64
	}
	hypoBackMessage := &HypoBackMessage{
		TableID: t.ID,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("hypoBack", hypoBackMessage)
	}
}

func commandReplayActionToggleRevealed(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	g.HypoDrawnCardsShown = !g.HypoDrawnCardsShown

	type HypoDrawnCardsShownMessage struct {
		TableID         uint64 `json:"tableID"`
		DrawnCardsShown bool   `json:"drawnCardsShown"`
	}
	hypoDrawnCardsShownMessage := &HypoDrawnCardsShownMessage{
		TableID:         t.ID,
		DrawnCardsShown: g.HypoDrawnCardsShown,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("hypoDrawnCardsShown", hypoDrawnCardsShownMessage)
	}
}
