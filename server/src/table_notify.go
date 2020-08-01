package main

/*
	Notifications for both before and during a game
*/

func (t *Table) NotifyChat(chatMessage *ChatMessage) {
	if !t.Replay {
		for _, p := range t.Players {
			if p.Present {
				p.Session.Emit("chat", chatMessage)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.Emit("chat", chatMessage)
	}
}

func (t *Table) NotifyChatTyping(name string, typing bool) {
	if !t.Replay {
		for _, p := range t.Players {
			if p.Present && p.Name != name { // We do not need to alert the person who is typing
				p.Session.NotifyChatTyping(name, typing)
			}
		}
	}

	for _, sp := range t.Spectators {
		if sp.Name != name { // We do not need to alert the person who is typing
			sp.Session.NotifyChatTyping(name, typing)
		}
	}
}

/*
	Notifications before a game has started
*/

// NotifyPlayerChange sends the people in the pre-game an update about the new amount of players
// This is only called in situations where the game has not started yet
func (t *Table) NotifyPlayerChange() {
	if t.Running {
		logger.Error("The \"NotifyPlayerChange()\" function was called on a game that has already started.")
		return
	}

	for _, p := range t.Players {
		if !p.Present {
			continue
		}

		// First, make the array that contains information about all of the players in the game
		type GamePlayerMessage struct {
			Index   int          `json:"index"`
			Name    string       `json:"name"`
			You     bool         `json:"you"`
			Present bool         `json:"present"`
			Stats   PregameStats `json:"stats"`
		}
		gamePlayers := make([]*GamePlayerMessage, 0)
		for j, p2 := range t.Players {
			gamePlayer := &GamePlayerMessage{
				Index:   j,
				Name:    p2.Name,
				You:     p.ID == p2.ID,
				Present: p2.Present,
				Stats:   p2.Stats,
			}
			gamePlayers = append(gamePlayers, gamePlayer)
		}

		// Second, send information about the game and the players in one big message
		type GameMessage struct {
			Name              string               `json:"name"`
			Owner             int                  `json:"owner"`
			Players           []*GamePlayerMessage `json:"players"`
			Options           *Options             `json:"options"`
			PasswordProtected bool                 `json:"passwordProtected"`
		}
		p.Session.Emit("game", &GameMessage{
			Name:              t.Name,
			Owner:             t.Owner,
			Players:           gamePlayers,
			Options:           t.Options,
			PasswordProtected: t.PasswordHash != "",
		})
	}
}

/*
	Notifications after a game has started
*/

// NotifyConnected will send "connected" messages to everyone in a game
// (because someone just connected or disconnected)
// This is never called in replays
func (t *Table) NotifyConnected() {
	if !t.Running {
		logger.Error("The \"NotifyConnected()\" function was called on a game that has not started yet.")
		return
	}

	if !t.Replay {
		for _, p := range t.Players {
			if p.Present {
				p.Session.NotifyConnected(t)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifyConnected(t)
	}
}

func (t *Table) NotifySpectators() {
	if !t.Visible {
		return
	}

	// If this is a replay, then all of the players are also spectators,
	// so we do not want to send them a duplicate message
	if !t.Replay {
		for _, p := range t.Players {
			if p.Present {
				p.Session.NotifySpectators(t)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifySpectators(t)
	}
}

// NotifyStatus appends a new "status" action and alerts everyone
func (t *Table) NotifyStatus() {
	g := t.Game
	g.Actions = append(g.Actions, ActionStatus{
		Type:          "status",
		Clues:         g.ClueTokens,
		Score:         g.Score,
		MaxScore:      g.MaxScore,
		DoubleDiscard: g.DoubleDiscard,
	})
	t.NotifyGameAction()

	// Also send updates on stack directions
	t.NotifyStackDirections()
}

func (t *Table) NotifyStackDirections() {
	g := t.Game

	// If we are playing a "Reversed" or "Up or Down" variant, we also need to send the stack directions
	if variants[g.Options.VariantName].HasReversedSuits() {
		// Since StackDirections is a slice, it will be stored as a pointer
		// (unlike the primitive values that we used for the ActionStatus message above)
		// So, make a copy to preserve the stack directions for this exact moment in time
		playStackDirections := make([]int, len(g.PlayStackDirections))
		copy(playStackDirections, g.PlayStackDirections)
		g.Actions = append(g.Actions, ActionPlayStackDirections{
			Type:       "playStackDirections",
			Directions: playStackDirections,
		})
		t.NotifyGameAction()
	}
}

// NotifyTurn appends a new "turn" action and alerts everyone
func (t *Table) NotifyTurn() {
	g := t.Game
	currentPlayerIndex := g.ActivePlayerIndex
	if g.EndCondition > EndConditionInProgress {
		currentPlayerIndex = -1
	}
	g.Actions = append(g.Actions, ActionTurn{
		Type:               "turn",
		Num:                g.Turn,
		CurrentPlayerIndex: currentPlayerIndex,
	})
	t.NotifyGameAction()
}

// NotifyGameAction sends the people in the game an update about the new action
func (t *Table) NotifyGameAction() {
	g := t.Game

	if !t.Running {
		// We might be doing the initial actions;
		// don't send any messages to players if this is the case
		return
	}

	// Get the last action of the game
	a := g.Actions[len(g.Actions)-1]

	for _, gp := range g.Players {
		p := t.Players[gp.Index]
		if p.Present {
			p.Session.NotifyGameAction(t, a)
		}
	}

	// Also send the spectators an update
	for _, sp := range t.Spectators {
		sp.Session.NotifyGameAction(t, a)
	}
}

// NotifySound sends a sound notification to everyone in the game
// (signifying that an action just occurred)
func (t *Table) NotifySound() {
	for i, p := range t.Players {
		if p.Present {
			p.Session.NotifySound(t, i)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifySound(t, -1)
	}
}

func (t *Table) NotifyGameOver() {
	type GameOverMessage struct {
		DatabaseID         int    `json:"databaseID"`
		SharedReplayLeader string `json:"sharedReplayLeader"`
	}
	gameOverMessage := &GameOverMessage{
		DatabaseID:         t.ExtraOptions.DatabaseID,
		SharedReplayLeader: t.GetSharedReplayLeaderName(),
	}

	for _, sp := range t.Spectators {
		sp.Session.Emit("gameOver", gameOverMessage)
	}
}

func (t *Table) NotifyCardIdentities() {
	for _, sp := range t.Spectators {
		sp.Session.NotifyCardIdentities(t)
	}
}

func (t *Table) NotifyTime() {
	for _, p := range t.Players {
		if p.Present {
			p.Session.NotifyTime(t)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifyTime(t)
	}
}

func (t *Table) NotifyPause() {
	for _, p := range t.Players {
		if p.Present {
			p.Session.NotifyPause(t)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifyPause(t)
	}
}

func (t *Table) NotifyReplayLeader() {
	for _, sp := range t.Spectators {
		sp.Session.NotifyReplayLeader(t)
	}
}

func (t *Table) NotifySpectatorsNote(order int) {
	g := t.Game

	for _, sp := range t.Spectators {
		// Make an array that contains the combined notes for all the players & spectators
		// (for a specific card)
		// However, if this spectator is shadowing a specific player, then only include the note for
		// the shadowed player
		type Note struct {
			Name string `json:"name"`
			Note string `json:"note"`
		}
		notes := make([]Note, 0)
		for _, p := range g.Players {
			if sp.ShadowPlayerIndex == -1 || sp.ShadowPlayerIndex == p.Index {
				notes = append(notes, Note{
					Name: p.Name,
					Note: p.Notes[order],
				})
			}
		}
		if sp.ShadowPlayerIndex == -1 {
			for _, sp2 := range t.Spectators {
				notes = append(notes, Note{
					Name: sp2.Name,
					Note: sp2.Notes[order],
				})
			}
		}

		type NoteMessage struct {
			// The order of the card in the deck that these notes correspond to
			Order int    `json:"order"`
			Notes []Note `json:"notes"`
		}
		sp.Session.Emit("note", &NoteMessage{
			Order: order,
			Notes: notes,
		})
	}
}

func (t *Table) NotifyProgress() {
	if !t.Running {
		// We might be doing the initial actions;
		// don't send any messages to players if this is the case
		return
	}

	if !t.Visible {
		// Don't send progress for solo replays
		return
	}

	for _, s := range t.GetNotifySessions(false) {
		s.NotifyTableProgress(t)
	}
}

// NotifyBoot boots the people in a game or shared replay back to the lobby screen
func (t *Table) NotifyBoot() {
	if !t.Replay {
		for _, p := range t.Players {
			if p.Present {
				p.Session.Emit("boot", nil)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.Emit("boot", nil)
	}
}
