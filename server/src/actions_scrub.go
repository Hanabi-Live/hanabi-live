package main

import (
	"strings"
)

// CheckScrub removes some information from the action to prevent players having more knowledge
// than they should have, if necessary (e.g. when a card is drawn to a player's hand)
func CheckScrub(t *Table, action interface{}, userID int) interface{} {
	drawAction, ok := action.(ActionDraw)
	if ok && drawAction.Type == "draw" {
		drawAction.Scrub(t, userID)
		return drawAction
	}

	playAction, ok := action.(ActionPlay)
	if ok && playAction.Type == "play" {
		playAction.Scrub(t, userID)
		return playAction
	}

	cardIdentityAction, ok := action.(ActionCardIdentity)
	if ok && cardIdentityAction.Type == "cardIdentity" {
		cardIdentityAction.Scrub(t, userID)
		return cardIdentityAction
	}

	return action
}

// Scrub removes some information from an action so that we do not reveal the identity of drawn
// cards to the players drawing those cards
func (a *ActionDraw) Scrub(t *Table, userID int) {
	// Local variables
	g := t.Game
	p := getEquivalentPlayer(t, userID)

	if p == nil {
		// Spectators get to see the identities of all drawn cards
		return
	}

	if a.PlayerIndex == p.Index || // They are drawing the card
		// They are playing a special character that should not be able to see the card
		characterHideCard(a, g, p) {

		a.Rank = -1
		a.SuitIndex = -1
	}
}

// Scrub removes some information from played cards so that we do not reveal the identity of played
// cards to anybody (in some specific variants)
func (a *ActionPlay) Scrub(t *Table, userID int) {
	if !strings.HasPrefix(t.Options.VariantName, "Throw It in a Hole") {
		// In normal variants, everyone gets to see the identities of played cards
		return
	}

	p := getEquivalentPlayer(t, userID)

	if p == nil {
		// Spectators get to see the identities of played cards
		return
	}

	a.Rank = -1
	a.SuitIndex = -1
}

// Scrub removes some information from an action so that we do not reveal the identity of sliding
// cards to the players who are holding those cards
func (a *ActionCardIdentity) Scrub(t *Table, userID int) {
	// Local variables
	p := getEquivalentPlayer(t, userID)

	if p == nil {
		// Spectators get to see the identities of all cards
		return
	}

	if a.PlayerIndex == p.Index { // They are holding the card
		a.Rank = -1
		a.SuitIndex = -1
	}
}

func getEquivalentPlayer(t *Table, userID int) *GamePlayer {
	// Local variables
	g := t.Game
	i := t.GetPlayerIndexFromID(userID)
	j := t.GetSpectatorIndexFromID(userID)

	if i > -1 {
		// The action is going to be sent to one of the active players
		return g.Players[i]
	} else if j > -1 && t.Spectators[j].Shadowing {
		// The action is going to be sent to a spectator that is shadowing one of the active players
		return g.Players[t.Spectators[j].PlayerIndex]
	}

	return nil
}
