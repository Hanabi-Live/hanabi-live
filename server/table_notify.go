package main

/*

// -----------------------------------------------
// Notifications for both before and during a game
// -----------------------------------------------

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
				p.Session.NotifyChatTyping(t, name, typing)
			}
		}
	}

	for _, sp := range t.Spectators {
		if sp.Name != name { // We do not need to alert the person who is typing
			sp.Session.NotifyChatTyping(t, name, typing)
		}
	}
}

// --------------------------------------
// Notifications after a game has started
// --------------------------------------

// NotifyConnected will send "connected" messages to everyone in a game
// (because someone just connected or disconnected)
// This is never called in replays
func (t *Table) NotifyConnected() {
	if !t.Running {
		hLog.Error("The \"NotifyConnected()\" function was called on a game that has not started yet.")
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

// NotifyStatus appends a new "status" action and alerts everyone
func (t *Table) NotifyStatus() {
	g := t.Game
	g.Actions = append(g.Actions, ActionStatus{
		Type:     "status",
		Clues:    g.ClueTokens,
		Score:    g.Score,
		MaxScore: g.MaxScore,
	})
	t.NotifyGameAction()
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

func (t *Table) NotifyFinishOngoingGame() {
	type FinishOngoingGameMessage struct {
		TableID            uint64 `json:"tableID"`
		DatabaseID         int    `json:"databaseID"`
		SharedReplayLeader string `json:"sharedReplayLeader"`
	}
	finishOngoingGameMessage := &FinishOngoingGameMessage{
		TableID:            t.ID,
		DatabaseID:         t.ExtraOptions.DatabaseID,
		SharedReplayLeader: t.GetSharedReplayLeaderName(),
	}

	// At this point, all of the players will have been converted to spectators
	for _, sp := range t.Spectators {
		sp.Session.Emit("finishOngoingGame", finishOngoingGameMessage)
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

// NotifyBoot boots the people in a game or shared replay back to the lobby screen
func (t *Table) NotifyBoot() {
	if !t.Replay {
		for _, p := range t.Players {
			if p.Present {
				p.Session.NotifyBoot(t)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifyBoot(t)
	}
}

*/
