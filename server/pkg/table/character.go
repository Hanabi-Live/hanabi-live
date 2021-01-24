package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/characters"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

func (m *Manager) characterAdjustEndTurn() {
	// Local variables
	t := m.table
	g := t.Game

	if !t.Options.DetrimentalCharacters {
		return
	}

	// Check to see if anyone is playing as a character that will adjust
	// the final go-around of the table
	for _, p := range g.Players {
		if p.Character == characters.Contrarian { // 27
			// We use 3 instead of 2 because it should be 2 turns after the final card is drawn
			g.EndTurn = g.Turn + 3 // nolint: gomnd
		}
	}
}

func (m *Manager) characterCheckMisplay(p *gamePlayer, c *card) bool {
	// Local variables
	t := m.table
	g := t.Game

	if !t.Options.DetrimentalCharacters {
		return false
	}

	if p.Character == characters.Follower { // 31
		// Look through the stacks to see if two cards of this rank have already been played
		numPlayedOfThisRank := 0
		for _, s := range g.Stacks {
			if s >= c.Rank {
				numPlayedOfThisRank++
			}
		}
		if numPlayedOfThisRank < 2 { // nolint: gomnd
			return true
		}
	}

	return false
}

func (m *Manager) characterHideDrawnCard(p *gamePlayer, actionDraw types.ActionDraw) bool {
	// Local variables
	t := m.table

	if !t.Options.DetrimentalCharacters {
		return false
	}

	switch p.Character {
	case characters.BlindSpot: // 29
		if actionDraw.PlayerIndex == p.getNextPlayer() {
			return true
		}

	case characters.Oblivious: // 30
		if actionDraw.PlayerIndex == p.getPreviousPlayer() {
			return true
		}

	case characters.SlowWitted: // 33
		return true
	}

	return false
}

func (m *Manager) characterPostClue(p *gamePlayer, clue *types.Clue, p2 *gamePlayer) {
	// Local variables
	t := m.table
	g := t.Game

	if !t.Options.DetrimentalCharacters {
		return
	}

	switch p.Character {
	case characters.MoodSwings: // 12
		p.CharacterMetadata = int(clue.Type)

	case characters.Insistent: // 13
		// Don't do anything if they are already in their "Insistent" state
		if p.CharacterMetadata == -1 {
			// Mark that the cards that they clued must be continue to be clued
			cardsTouched := p2.getCardsTouchedByClue(clue)
			for _, order := range cardsTouched {
				c := g.Deck[order]
				c.InsistentTouched = true
			}
			p.CharacterMetadata = 0 // 0 means that the "Insistent" state is activated
		}
	}

	switch p2.Character {
	case characters.Vindictive: // 9
		// Store that they have had at least one clue given to them on this go-around of the table
		p2.CharacterMetadata = 0

	case characters.Impulsive: // 17
		if p2.isFirstCardTouchedByClue(clue) {
			// Store that they had their slot 1 card clued
			p2.CharacterMetadata = 0
		}
	}
}

func (m *Manager) characterPostRemoveCard(p *gamePlayer, c *card) {
	// Local variables
	t := m.table
	g := t.Game

	if !t.Options.DetrimentalCharacters {
		return
	}

	if !c.InsistentTouched {
		return
	}

	for _, c2 := range p.Hand {
		c2.InsistentTouched = false
	}

	// Find the "Insistent" player and reset their state so that
	// they are not forced to give a clue on their subsequent turn
	for _, p2 := range g.Players {
		if p2.Character == characters.Insistent { // 13
			p2.CharacterMetadata = -1
			break // Only one player should be Insistent
		}
	}
}

func (m *Manager) characterSendCardIdentityOfSlot2(playerIndexDrawingCard int) {
	// Local variables
	t := m.table
	g := t.Game
	p := g.Players[playerIndexDrawingCard]

	if !t.Options.DetrimentalCharacters {
		return
	}

	if len(p.Hand) <= 1 {
		return
	}

	hasSlowWitted := false
	for _, p2 := range g.Players {
		if p2.Character == characters.SlowWitted { // 33
			hasSlowWitted = true
			break
		}
	}

	if hasSlowWitted {
		// Card information will be scrubbed from the action in the "CheckScrub()" function
		slot2Index := len(p.Hand) - 2 // nolint: gomnd
		c := p.Hand[slot2Index]
		g.Actions = append(g.Actions, types.ActionCardIdentity{
			Type:        "cardIdentity",
			PlayerIndex: p.Index,
			Order:       c.Order,
			SuitIndex:   c.SuitIndex,
			Rank:        c.Rank,
		})
		m.notifyGameAction()
	}
}
