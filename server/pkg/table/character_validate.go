package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/characters"
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

func (m *Manager) characterValidateAction(d *actionData, p *gamePlayer) bool {
	// Local variables
	t := m.table

	if !t.Options.DetrimentalCharacters {
		return true
	}

	switch p.Character {
	case characters.Vindictive: // 9
		if p.CharacterMetadata == 0 &&
			d.actionType != constants.ActionTypeColorClue &&
			d.actionType != constants.ActionTypeRankClue {

			msg := fmt.Sprintf(
				"You are %v, so you must give a clue if you have been given a clue on this go-around.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Insistent: // 13
		if p.CharacterMetadata != -1 &&
			d.actionType != constants.ActionTypeColorClue &&
			d.actionType != constants.ActionTypeRankClue {

			msg := fmt.Sprintf(
				"You are %v, so you must continue to clue the same card until it is played or discarded.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Impulsive: // 17
		slot1Order := p.Hand[len(p.Hand)-1].Order

		if p.CharacterMetadata == 0 &&
			(d.actionType != constants.ActionTypePlay ||
				d.target != slot1Order) {

			msg := fmt.Sprintf(
				"You are %v, so you must play your slot 1 card after it has been clued.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Indolent: // 18
		if d.actionType == constants.ActionTypePlay && p.CharacterMetadata == 0 {
			msg := fmt.Sprintf(
				"You are %v, so you cannot play a card if you played one in the last round.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Stubborn: // 28
		if d.actionType == constants.ActionType(p.CharacterMetadata) ||
			(d.actionType == constants.ActionTypeColorClue &&
				constants.ActionType(p.CharacterMetadata) == constants.ActionTypeRankClue) ||
			(d.actionType == constants.ActionTypeRankClue &&
				constants.ActionType(p.CharacterMetadata) == constants.ActionTypeColorClue) {

			msg := fmt.Sprintf(
				"You are %v, so you cannot perform the same kind of action that the previous player did.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	return true
}

func (m *Manager) characterValidateSecondAction(d *actionData, p *gamePlayer) bool {
	// Local variables
	t := m.table

	if !t.Options.DetrimentalCharacters {
		return true
	}

	if p.CharacterMetadata == -1 {
		return true
	}

	switch p.Character {
	case characters.Genius: // 24
		if d.actionType != constants.ActionTypeRankClue {
			msg := fmt.Sprintf("You are %v, so you must now give a rank clue.", p.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

		if d.target != p.CharacterMetadata {
			msg := fmt.Sprintf(
				"You are %v, so you must give the second clue to the same player.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Panicky: // 26
		if d.actionType != constants.ActionTypeDiscard {
			msg := fmt.Sprintf(
				"You are %v, so you must discard again since there are 4 or less clues available.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	return true
}

func (m *Manager) characterValidateClueGiver(d *actionData, p *gamePlayer, p2 *gamePlayer) bool {
	// Local variables
	t := m.table
	g := t.Game

	if !t.Options.DetrimentalCharacters {
		return true
	}

	clue := types.NewClue(d.actionType, d.value) // Convert the incoming data to a clue object
	cardsTouched := p2.getCardsTouchedByClue(clue)

	switch p.Character {
	case characters.Fuming: // 0
		if clue.Type == constants.ClueTypeColor && clue.Value != p.CharacterMetadata {
			msg := fmt.Sprintf("You are %v, so you can not give that type of clue.", p.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Dumbfounded: // 1
		if clue.Type == constants.ClueTypeRank && clue.Value != p.CharacterMetadata {
			msg := fmt.Sprintf("You are %v, so you can not give that type of clue.", p.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Inept: // 2
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.SuitIndex == p.CharacterMetadata {
				msg := fmt.Sprintf(
					"You are %v, so you cannot give clues that touch a specific suit.",
					p.Character,
				)
				m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
				return false
			}
		}

	case characters.Awkward: // 3
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.Rank == p.CharacterMetadata {
				msg := fmt.Sprintf(
					"You are %v, so you cannot give clues that touch cards with a rank of %v.",
					p.Character,
					p.CharacterMetadata,
				)
				m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
				return false
			}
		}

	case characters.Conservative: // 4
		if len(cardsTouched) != 1 {
			msg := fmt.Sprintf(
				"You are %v, so you can only give clues that touch a single card.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Greedy: // 5
		if len(cardsTouched) < 2 { // nolint: gomnd
			msg := fmt.Sprintf(
				"You are %v, so you can only give clues that touch 2+ cards.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Picky: // 6
		if (clue.Type == constants.ClueTypeRank && clue.Value%2 == 0) ||
			(clue.Type == constants.ClueTypeColor && (clue.Value+1)%2 == 0) {

			msg := fmt.Sprintf(
				"You are %v, so you can only clue odd numbers or odd colors.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Spiteful: // 7
		leftIndex := p.Index + 1
		if leftIndex == len(g.Players) {
			leftIndex = 0
		}
		if d.target == leftIndex {
			msg := fmt.Sprintf(
				"You are %v, so you cannot clue the player to your left.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Insolent: // 8
		rightIndex := p.Index - 1
		if rightIndex == -1 {
			rightIndex = len(g.Players) - 1
		}
		if d.target == rightIndex {
			msg := fmt.Sprintf("You are %v, so you cannot clue the player to your right.", p.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Miser: // 10
		if g.ClueTokens < t.Variant.GetAdjustedClueTokens(4) { // nolint: gomnd
			msg := fmt.Sprintf(
				"You are %v, so you cannot give a clue unless there are 4 or more clues available.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Compulsive: // 11
		if !p2.isFirstCardTouchedByClue(clue) && !p2.isLastCardTouchedByClue(clue) {
			msg := fmt.Sprintf(
				"You are %v, so you can only give a clue if it touches either the newest or oldest card in a hand.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.MoodSwings: // 12
		if constants.ClueType(p.CharacterMetadata) == clue.Type {
			msg := fmt.Sprintf(
				"You are %v, so cannot give the same clue type twice in a row.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Insistent: // 13
		if p.CharacterMetadata != -1 {
			touchedInsistentCard := false
			for _, order := range cardsTouched {
				c := g.Deck[order]
				if c.InsistentTouched {
					touchedInsistentCard = true
					break
				}
			}
			if !touchedInsistentCard {
				msg := fmt.Sprintf(
					"You are %v, so you must continue to clue a card until it is played or discarded.",
					p.Character,
				)
				m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
				return false
			}
		}

	case characters.Genius: // 24
		if p.CharacterMetadata == -1 {
			if g.ClueTokens < t.Variant.GetAdjustedClueTokens(2) { // nolint: gomnd
				msg := fmt.Sprintf(
					"You are %v, so there needs to be at least 2 clues available for you to give a clue.",
					p.Character,
				)
				m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
				return false
			}

			if clue.Type != constants.ClueTypeColor {
				msg := fmt.Sprintf("You are %v, so you must give a color clue first.", p.Character)
				m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
				return false
			}
		}
	}

	return true
}

func (m *Manager) characterValidateClueReceiver(d *actionData, p2 *gamePlayer) bool {
	// Local variables
	t := m.table

	if !t.Options.DetrimentalCharacters {
		return true
	}

	clue := types.NewClue(d.actionType, d.value) // Convert the incoming data to a clue object

	switch p2.Character {
	case characters.Vulnerable: // 14
		if clue.Type == constants.ClueTypeRank &&
			(clue.Value == 2 || clue.Value == 5) {

			msg := fmt.Sprintf(
				"You cannot give a number 2 or number 5 clue to a %v character.",
				p2.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.ColorBlind: // 15
		if clue.Type == constants.ClueTypeColor {
			msg := fmt.Sprintf("You cannot give that color clue to a %v character.", p2.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	return true
}

func (m *Manager) characterValidatePlay(d *actionData, p *gamePlayer) bool {
	// Local variables
	t := m.table

	if !t.Options.DetrimentalCharacters {
		return true
	}

	switch p.Character {
	case characters.Hesitant: // 19
		if p.getCardSlot(d.target) == 1 {
			msg := fmt.Sprintf("You cannot play that card since you are a %v character.", p.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	return true
}

func (m *Manager) characterValidateDiscard(d *actionData, p *gamePlayer) bool {
	// Local variables
	t := m.table
	g := t.Game

	if !t.Options.DetrimentalCharacters {
		return true
	}

	switch p.Character {
	case characters.Anxious: // 21
		if g.ClueTokens%2 == 0 { // Even amount of clues
			msg := fmt.Sprintf(
				"You are %v, so you cannot discard when there is an even number of clues available.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Traumatized: // 22
		if g.ClueTokens%2 == 1 { // Odd amount of clues
			msg := fmt.Sprintf(
				"You are %v, so you cannot discard when there is an odd number of clues available.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case characters.Wasteful: // 23
		if g.ClueTokens >= t.Variant.GetAdjustedClueTokens(2) { // nolint: gomnd
			msg := fmt.Sprintf(
				"You are %v, so you cannot discard if there are 2 or more clues available.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	return true
}

func (m *Manager) characterValidateSeesCard(p *gamePlayer, p2 *gamePlayer, cardOrder int) bool {
	// Local variables
	t := m.table

	if !t.Options.DetrimentalCharacters {
		return true
	}

	switch p.Character {
	case characters.BlindSpot: // 29
		if p2.Index == p.getNextPlayer() {
			// Cannot see the cards of the next player
			return false
		}

	case characters.Oblivious: // 30
		if p2.Index == p.getPreviousPlayer() {
			// Cannot see the cards of the previous player
			return false
		}

	case characters.SlowWitted: // 33
		if p2.getCardSlot(cardOrder) == 1 {
			// Cannot see cards in slot 1
			return false
		}
	}

	return true
}
