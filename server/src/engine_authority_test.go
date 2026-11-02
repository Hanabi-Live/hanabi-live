package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// These compact traces exercise actual Go validation/application, not the client
// reducer. Historical interpretation avoids database/time dependencies at game end.
// Update explicitly with -update-compatibility, then review the fixture diff.
type engineAuthorityTrace struct {
	Name       string                 `json:"name"`
	Options    *Options               `json:"options"`
	Seed       string                 `json:"seed"`
	Characters []*CharacterAssignment `json:"characters"`
	Initial    engineAuthorityPoint   `json:"initial"`
	Steps      []engineAuthorityStep  `json:"steps"`
	Deck       []*CardIdentity        `json:"deck,omitempty"`
	Live       bool                   `json:"live,omitempty"`
	script     []*GameAction
	limit      int
}

type engineAuthorityPoint struct {
	State      string   `json:"state"`
	Events     string   `json:"events"`
	Visibility []string `json:"visibility"`
}

type engineAuthorityStep struct {
	Action   *GameAction          `json:"action"`
	Accepted bool                 `json:"accepted"`
	Result   engineAuthorityPoint `json:"result"`
}

func engineAuthorityDigest(t *testing.T, data interface{}) string {
	t.Helper()
	// Round-trip to maps so every nested object has sorted keys.
	var canonical interface{}
	if err := json.Unmarshal(compatibilityJSON(t, data), &canonical); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(compatibilityJSON(t, canonical))
	return hex.EncodeToString(digest[:])
}

func engineAuthorityState(t *testing.T, g *Game) map[string]interface{} {
	t.Helper()
	players := make([]map[string]interface{}, 0, len(g.Players))
	for _, p := range g.Players {
		hand := make([]int, 0, len(p.Hand))
		for _, c := range p.Hand {
			hand = append(hand, c.Order)
		}
		players = append(players, map[string]interface{}{
			"Name": p.Name, "Index": p.Index, "Hand": hand,
			"Character": p.Character, "CharacterMetadata": p.CharacterMetadata,
		})
	}
	cards := make([]map[string]interface{}, 0)
	for _, c := range g.Deck {
		if c.Slot == 0 && !c.Touched && !c.Discarded && !c.Played &&
			!c.Failed && !c.CannotBePlayed && !c.InsistentTouched {
			continue
		}
		cards = append(cards, map[string]interface{}{
			"Order": c.Order, "Slot": c.Slot, "Touched": c.Touched,
			"Discarded": c.Discarded, "Played": c.Played, "Failed": c.Failed,
			"CannotBePlayed": c.CannotBePlayed, "InsistentTouched": c.InsistentTouched,
		})
	}
	return map[string]interface{}{
		"Players": players, "Cards": cards, "Actions2": g.Actions2, "Seed": g.Seed,
		"DeckIndex": g.DeckIndex, "Stacks": g.Stacks, "StackStarts": g.StackStarts,
		"PlayStackDirections": g.PlayStackDirections, "Turn": g.Turn,
		"TurnsInverted": g.TurnsInverted, "ActivePlayerIndex": g.ActivePlayerIndex,
		"ClueTokens": g.ClueTokens, "Score": g.Score, "MaxScore": g.MaxScore,
		"Strikes": g.Strikes, "LastClueTypeGiven": g.LastClueTypeGiven,
		"EndCondition": g.EndCondition, "EndPlayer": g.EndPlayer, "EndTurn": g.EndTurn,
		"StartedTimer": g.StartedTimer, "Paused": g.Paused,
	}
}

func engineAuthorityCapture(t *testing.T, g *Game, start int) engineAuthorityPoint {
	t.Helper()
	events := append(make([]interface{}, 0), g.Actions[start:]...)
	point := engineAuthorityPoint{
		State:  engineAuthorityDigest(t, engineAuthorityState(t, g)),
		Events: engineAuthorityDigest(t, events),
	}
	for _, recipient := range []int{1, 2, 100, 101} {
		visible := make([]interface{}, len(events))
		for index, action := range events {
			visible[index] = CheckScrub(g.Table, action, recipient)
		}
		point.Visibility = append(point.Visibility, engineAuthorityDigest(t, visible))
	}
	return point
}

func engineAuthorityCandidates(g *Game, iteration int) []*GameAction {
	p := g.Players[g.ActivePlayerIndex]
	actions := make([]*GameAction, 0)
	// Rotate action families so traces explore both valid and forbidden choices.
	for kindOffset := 0; kindOffset < 4; kindOffset++ {
		kind := (iteration + kindOffset) % 4
		if kind < 2 {
			for _, card := range p.Hand {
				if kind == ActionTypePlay && iteration%31 != 30 && !engineAuthorityPlayable(g, p, card) {
					continue
				}
				actions = append(actions, &GameAction{Type: kind, Target: card.Order})
			}
			if g.Options.DeckPlays && g.DeckIndex == len(g.Deck)-1 {
				actions = append(actions, &GameAction{Type: kind, Target: g.DeckIndex})
			}
			continue
		}
		values := g.Variant.ClueRanks
		if kind == ActionTypeColorClue {
			values = make([]int, len(g.Variant.ClueColors))
			for i := range values {
				values[i] = i
			}
		}
		for target := range g.Players {
			if target == p.Index {
				continue
			}
			for _, value := range values {
				actions = append(actions, &GameAction{Type: kind, Target: target, Value: value})
			}
		}
	}
	return actions
}

func engineAuthorityPlayable(g *Game, p *GamePlayer, card *Card) bool {
	copyGame := *g
	copyGame.PlayStackDirections = append([]int(nil), g.PlayStackDirections...)
	copyGame.StackStarts = append([]int(nil), g.StackStarts...)
	failed := card.Rank != g.Stacks[card.SuitIndex]+1
	if g.Variant.IsSudoku() {
		failed = variantSudokuPlay(&copyGame, card)
	} else if g.Variant.HasReversedSuits() {
		failed = variantReversiblePlay(&copyGame, card)
	}
	return !failed && !characterCheckMisplay(&copyGame, p, card)
}

func TestEngineAuthorityTraces(t *testing.T) {
	loadCompatibilityCatalog(t)
	oldActions, oldDev := actionFunctions, isDev
	actionsFunctionsInit()
	isDev = true
	t.Cleanup(func() { actionFunctions, isDev = oldActions, oldDev })
	traces := make([]engineAuthorityTrace, 0)
	standardOptions := NewOptions()
	standardOptions.NumPlayers = 2
	traces = append(traces, engineAuthorityTrace{
		Name: "standard/benchmark", Options: standardOptions, Seed: "p2v0s17",
	})
	variantsToTest := []string{
		"No Variant", "Reversed (5 Suits)", "Up or Down (5 Suits)", "Sudoku (5 Suits)",
		"Clue Starved (5 Suits)", "Throw It in a Hole (5 Suits)", "Orange (5 Suits)",
		"Alternating Clues (5 Suits)", "Prism (5 Suits)", "Rainbow (5 Suits)", "Pink (5 Suits)",
		"Synesthesia (5 Suits)", "Cow & Pig (5 Suits)", "Duck (5 Suits)",
		"Color Blind (5 Suits)", "Number Blind (5 Suits)", "Odds and Evens (5 Suits)",
		"Funnels (5 Suits)", "Chimneys (5 Suits)", "Deceptive-Ones (5 Suits)",
		"Sudoku (4 Suits)", "Up or Down & Prism (5 Suits)", "Sudoku & Prism (5 Suits)",
		"Black (5 Suits)", "Dark Rainbow (5 Suits)", "Light Pink (5 Suits)",
	}
	// All catalog characters, plus representative full games with 2--6 players.
	for _, name := range characterNames {
		options := NewOptions()
		options.NumPlayers = 3
		options.DetrimentalCharacters = true
		options.EmptyClues = true
		assignments := []*CharacterAssignment{{Name: name, Metadata: -1}, {Name: "n/a", Metadata: -1}, {Name: "n/a", Metadata: -1}}
		if name == "Fuming" || name == "Inept" {
			assignments[0].Metadata = 0
		} else if name == "Dumbfounded" || name == "Awkward" {
			assignments[0].Metadata = 1
		}
		traces = append(traces, engineAuthorityTrace{Name: "character/" + name, Options: options, Seed: "p3v0s17", Characters: assignments})
	}
	for index, variant := range variantsToTest {
		options := NewOptions()
		options.NumPlayers = 2 + index%5
		options.VariantName = variant
		options.DeckPlays = true
		options.EmptyClues = true
		options.CardCycle = index%2 == 0
		options.OneExtraCard = index%3 == 0
		options.OneLessCard = index%3 == 1
		limit := 80
		if index >= 11 {
			limit = 16
		}
		traces = append(traces, engineAuthorityTrace{Name: "variant/" + variant, Options: options, Seed: fmt.Sprintf("p%dv0s17", options.NumPlayers), limit: limit})
	}
	for _, mode := range []string{"speedrun", "all-or-nothing"} {
		options := NewOptions()
		options.NumPlayers = 2
		options.Speedrun = mode == "speedrun"
		options.AllOrNothing = mode == "all-or-nothing"
		traces = append(traces, engineAuthorityTrace{Name: mode, Options: options, Seed: "p2v0s1"})
	}
	combinedOptions := NewOptions()
	combinedOptions.NumPlayers = 3
	combinedOptions.DetrimentalCharacters = true
	traces = append(traces, engineAuthorityTrace{
		Name: "characters/combined-visibility", Options: combinedOptions, Seed: "p3v0s17", limit: 16,
		Characters: []*CharacterAssignment{{Name: "Slow-Witted", Metadata: -1}, {Name: "Blind Spot", Metadata: -1}, {Name: "Oblivious", Metadata: -1}},
	})
	for _, live := range []bool{false, true} {
		for _, kind := range []int{ActionTypePlay, ActionTypeDiscard} {
			options := NewOptions()
			options.NumPlayers = 2
			options.DeckPlays = true
			options.VariantName = "Orange (5 Suits)"
			traces = append(traces, engineAuthorityTrace{
				Name: fmt.Sprintf("inverted-deck/live=%t/action=%d", live, kind), Options: options,
				Seed: "JSON", Live: live, limit: 1,
				Deck:   []*CardIdentity{{0, 1}, {0, 2}, {0, 3}, {0, 4}, {0, 5}, {1, 1}, {1, 2}, {1, 3}, {1, 4}, {1, 5}, {4, 1}},
				script: []*GameAction{{Type: kind, Target: 10}},
			})
		}
	}
	for index := range traces {
		trace := &traces[index]
		t.Run(trace.Name, func(t *testing.T) {
			table := &Table{
				ID: 999, Name: trace.Name, Options: trace.Options,
				ExtraOptions: &ExtraOptions{NoWriteToDatabase: !trace.Live, CustomCharacterAssignments: trace.Characters, CustomDeck: trace.Deck},
			}
			g := NewGame(table, 0)
			g.Seed = trace.Seed
			g.InitDeck()
			if trace.Deck == nil {
				g.ShuffleDeck()
			}
			for order, card := range g.Deck {
				card.Order = order
			}
			names := []string{"Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"}
			for i := 0; i < trace.Options.NumPlayers; i++ {
				table.Players = append(table.Players, &Player{UserID: i + 1, Name: names[i]})
				g.Players = append(g.Players, &GamePlayer{
					Name: names[i], Index: i, Game: g, Hand: make([]*Card, 0),
					Notes: make([]string, g.GetNotesSize()), CharacterMetadata: -1,
				})
			}
			table.Spectators = []*Spectator{{UserID: 100, ShadowingPlayerIndex: -1}, {UserID: 101, ShadowingPlayerIndex: 0}}
			charactersGenerate(g)
			for _, player := range g.Players {
				for i := 0; i < g.GetHandSize(); i++ {
					player.DrawCard()
				}
			}
			trace.Initial = engineAuthorityCapture(t, g, 0)
			trace.Steps = make([]engineAuthorityStep, 0)
			limit := trace.limit
			if limit == 0 {
				limit = 80
			}
			for iteration := 0; iteration < limit && g.EndCondition == EndConditionInProgress; iteration++ {
				applied := false
				rejectedKinds := make(map[int]bool)
				candidates := engineAuthorityCandidates(g, iteration)
				if trace.script != nil {
					candidates = trace.script[iteration : iteration+1]
				}
				for _, candidate := range candidates {
					p := g.Players[g.ActivePlayerIndex]
					data := &CommandData{Type: candidate.Type, Target: candidate.Target, Value: candidate.Value}
					session := NewFakeSession(p.Index+1, p.Name)
					before := engineAuthorityDigest(t, engineAuthorityState(t, g))
					start := len(g.Actions)
					handler := actionFunctions[data.Type]
					valid := !characterValidateAction(session, data, g, p) &&
						!characterValidateSecondAction(session, data, g, p) &&
						handler.validate(session, data, g, p)
					g.InvalidActionOccurred = false
					if before != engineAuthorityDigest(t, engineAuthorityState(t, g)) {
						t.Fatal("validation mutated authoritative gameplay state")
					}
					if valid {
						applyAction(NewMiscContext("engine authority"), session, data, table, p, handler)
					}
					if valid || !rejectedKinds[data.Type] {
						trace.Steps = append(trace.Steps, engineAuthorityStep{
							Action: candidate, Accepted: valid, Result: engineAuthorityCapture(t, g, start),
						})
					}
					rejectedKinds[data.Type] = true
					if valid {
						applied = true
						break
					}
				}
				if !applied {
					break
				}
			}
		})
	}
	data, err := json.MarshalIndent(traces, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	data = append(data, '\n')
	filename := filepath.Join("testdata", "engine_authority.json")
	if *updateCompatibility {
		if err := os.WriteFile(filename, data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var old, current interface{}
	if err := json.Unmarshal(want, &old); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &current); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(old, current) {
		t.Fatal("Go authority traces changed; inspect before regenerating")
	}
}
