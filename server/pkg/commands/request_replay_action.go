package commands

import (
	"context"
	"encoding/json"
	"math"
	"regexp"
)

var (
	replayActionFunctions map[int]func(*Session, *CommandData, *Table)
	actionTypeTurnRegExp  = regexp.MustCompile(`"type":\s*"turn"`)
)

func replayActionsFunctionsInit() {
	replayActionFunctions = map[int]func(*Session, *CommandData, *Table){
		ReplayActionTypeSegment:        replayActionSegment,
		ReplayActionTypeArrow:          replayActionArrow,
		ReplayActionTypeSound:          replayActionSound,
		ReplayActionTypeHypoStart:      replayActionHypoStart,
		ReplayActionTypeHypoEnd:        replayActionHypoEnd,
		ReplayActionTypeHypoAction:     replayActionHypoAction,
		ReplayActionTypeHypoBack:       replayActionHypoBack,
		ReplayActionTypeToggleRevealed: replayActionToggleRevealed,
		ReplayActionTypeEfficiencyMod:  replayActionEfficiencyMod,
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
func commandReplayAction(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that this is a shared replay
	if !t.Replay || !t.Visible {
		s.Warningf(
			"Table %v is not a shared replay, so you cannot send a shared replay action.",
			t.ID,
		)
		return
	}

	// Validate that this person is spectating the shared replay
	j := t.GetSpectatorIndexFromID(s.UserID)
	if j < -1 {
		s.Warningf("You are not in shared replay: %v", t.Id)
		return
	}

	// Validate that this person is leading the shared replay
	if s.UserID != t.OwnerID {
		s.Warning("You cannot send a shared replay action unless you are the leader.")
		return
	}

	replayAction(ctx, s, d, t)
}

func replayAction(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Start the idle timeout
	go t.CheckIdle(ctx)

	// Do different tasks depending on the action
	if replayActionFunction, ok := replayActionFunctions[d.Type]; ok {
		replayActionFunction(s, d, t)
	} else {
		s.Warning("That is not a valid replay action type.")
		return
	}
}

func replayActionSegment(s *Session, d *CommandData, t *Table) {
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

func replayActionArrow(s *Session, d *CommandData, t *Table) {
	// Display an arrow to indicate a specific card that the shared replay leader wants to draw
	// attention to
	// The server does not know what a particular order value corresponds to;
	// it simply transmits the order chosen by the replay leader to everyone else
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

func replayActionSound(s *Session, d *CommandData, t *Table) {
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

func replayActionHypoStart(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	if g.Hypothetical {
		s.Warning("You are already in a hypothetical, so you cannot start a new one.")
		return
	}

	// Start a hypothetical line
	g.Hypothetical = true
	g.HypoShowDrawnCards = false

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

func replayActionHypoEnd(s *Session, d *CommandData, t *Table) {
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

func replayActionHypoAction(s *Session, d *CommandData, t *Table) {
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

func replayActionHypoBack(s *Session, d *CommandData, t *Table) {
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

func replayActionToggleRevealed(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	g.HypoShowDrawnCards = !g.HypoShowDrawnCards

	type HypoShowDrawnCardsMessage struct {
		TableID        uint64 `json:"tableID"`
		ShowDrawnCards bool   `json:"showDrawnCards"`
	}
	hypoShowDrawnCardsMessage := &HypoShowDrawnCardsMessage{
		TableID:        t.ID,
		ShowDrawnCards: g.HypoShowDrawnCards,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("hypoShowDrawnCards", hypoShowDrawnCardsMessage)
	}
}

func replayActionEfficiencyMod(s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	g.EfficiencyMod = d.Value
	type ReplayEfficiencyModMessage struct {
		TableID uint64 `json:"tableID"`
		Mod     int    `json:"mod"`
	}
	replayEfficiencyModMessage := &ReplayEfficiencyModMessage{
		TableID: t.ID,
		Mod:     g.EfficiencyMod,
	}
	for _, sp := range t.Spectators {
		sp.Session.Emit("replayEfficiencyMod", replayEfficiencyModMessage)
	}
}
