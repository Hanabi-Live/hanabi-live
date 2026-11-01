package main

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"
)

func TestActionValidationPrecedesMutation(t *testing.T) {
	tests := []struct {
		name       string
		actionType int
		value      int
		deck       bool
		inverted   bool
		replay     bool
		storedType int
	}{
		{"play", ActionTypePlay, 0, false, false, false, ActionTypePlay},
		{"discard", ActionTypeDiscard, 0, false, false, false, ActionTypeDiscard},
		{"color clue", ActionTypeColorClue, 0, false, false, false, ActionTypeColorClue},
		{"rank clue", ActionTypeRankClue, 1, false, false, false, ActionTypeRankClue},
		{"termination", ActionTypeEndGame, EndConditionTerminatedByPlayer, false, false, false, ActionTypeEndGame},
		{"vote", ActionTypeEndGameByVote, EndConditionTerminatedByVote, false, false, false, ActionTypeEndGameByVote},
		{"deck play", ActionTypePlay, 0, true, false, false, ActionTypePlay},
		{"inverted play", ActionTypePlay, 0, false, true, false, ActionTypeDiscard},
		{"inverted discard", ActionTypeDiscard, 0, false, true, false, ActionTypePlay},
		{"inverted deck play", ActionTypePlay, 0, true, true, false, ActionTypeDiscard},
		{"inverted deck discard", ActionTypeDiscard, 0, true, true, false, ActionTypePlay},
		{"historical inverted play", ActionTypePlay, 0, false, true, true, ActionTypePlay},
		{"historical inverted discard", ActionTypeDiscard, 0, false, true, true, ActionTypeDiscard},
		{"historical inverted deck play", ActionTypePlay, 0, true, true, true, ActionTypePlay},
		{"historical inverted deck discard", ActionTypeDiscard, 0, true, true, true, ActionTypeDiscard},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			table, _ := newTimerTestTable(t)
			g := table.Game
			g.ClueTokens = MaxClueNum - 1
			g.MaxScore = 25
			g.Stacks = make([]int, len(g.Variant.Suits))
			g.Variant.ClueRanks = []int{1, 2, 3, 4, 5}
			g.Variant.Suits[0].ClueColors = []string{"Red"}
			g.ExtraOptions.NoWriteToDatabase = test.replay
			d := &CommandData{Type: test.actionType, Value: test.value}
			if test.actionType == ActionTypeColorClue || test.actionType == ActionTypeRankClue {
				d.Target = 1
			}
			if test.deck {
				g.Options.DeckPlays = true
				g.DeckIndex = len(g.Deck) - 1
				d.Target = g.DeckIndex
			}
			if test.inverted {
				g.Variant.Suits[g.CardIdentities[d.Target].SuitIndex].Inverted = true
			}
			handler := actionFunctions[d.Type]
			before, err := json.Marshal(table)
			if err != nil {
				t.Fatal(err)
			}
			if !handler.validate(NewFakeSession(1, "Alice"), d, g, g.Players[0]) {
				t.Fatal("valid action was rejected")
			}
			after, err := json.Marshal(table)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(before, after) {
				t.Fatal("validation changed game state before application")
			}
			handler.apply(d, g, g.Players[0])
			if len(g.Actions2) != 1 || g.Actions2[0].Type != test.storedType {
				t.Fatalf("unexpected applied action: %+v", g.Actions2)
			}
			if test.actionType == ActionTypeColorClue || test.actionType == ActionTypeRankClue {
				if g.ClueTokens != MaxClueNum-2 || !g.Players[1].Hand[0].Touched {
					t.Fatal("accepted clue did not update tokens and touched cards")
				}
			}
		})
	}
}

func TestRejectedActionDoesNotRefreshActivity(t *testing.T) {
	for _, test := range []struct {
		name string
		data CommandData
	}{
		{"unknown type", CommandData{Type: -1}},
		{"missing card", CommandData{Type: ActionTypePlay, Target: -1}},
		{"full clues", CommandData{Type: ActionTypeDiscard, Target: 0}},
		{"invalid clue", CommandData{Type: ActionTypeRankClue, Target: 1, Value: -1}},
		{"invalid termination", CommandData{Type: ActionTypeEndGame, Value: -1}},
	} {
		t.Run(test.name, func(t *testing.T) {
			table, ctx := newTimerTestTable(t)
			g := table.Game
			g.ClueTokens = MaxClueNum
			lastActivity := time.Now().Add(-time.Minute)
			table.DatetimeLastAction = lastActivity
			test.data.TableID = table.ID
			before, err := json.Marshal(table)
			if err != nil {
				t.Fatal(err)
			}
			commandAction(ctx, NewFakeSession(1, "Alice"), &test.data)
			if !g.InvalidActionOccurred {
				t.Fatal("invalid action was not rejected")
			}
			g.InvalidActionOccurred = false
			after, err := json.Marshal(table)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(before, after) || table.idleTimer != nil {
				t.Fatal("a rejected action changed game state or refreshed the idle timeout")
			}
		})
	}
}
