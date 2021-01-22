package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

func (m *Manager) characterValidateAction(d *actionData, p *gamePlayer) bool {
	switch p.Character {
	case "Vindictive": // 9
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

	case "Insistent": // 13
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

	case "Impulsive": // 17
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

	case "Indolent": // 18
		if d.actionType == constants.ActionTypePlay && p.CharacterMetadata == 0 {
			msg := fmt.Sprintf(
				"You are %v, so you cannot play a card if you played one in the last round.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Stubborn": // 28
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
	if p.CharacterMetadata == -1 {
		return true
	}

	switch p.Character {
	case "Genius": // 24
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

	case "Panicky": // 26
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
	clue := types.NewClue(d.actionType, d.value) // Convert the incoming data to a clue object
	cardsTouched := p2.findCardsTouchedByClue(clue)

	switch p.Character {
	case "Fuming": // 0
		if clue.Type == constants.ClueTypeColor && clue.Value != p.CharacterMetadata {
			msg := fmt.Sprintf("You are %v, so you can not give that type of clue.", p.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Dumbfounded": // 1
		if clue.Type == constants.ClueTypeRank && clue.Value != p.CharacterMetadata {
			msg := fmt.Sprintf("You are %v, so you can not give that type of clue.", p.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Inept": // 2
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

	case "Awkward": // 3
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

	case "Conservative": // 4
		if len(cardsTouched) != 1 {
			msg := fmt.Sprintf(
				"You are %v, so you can only give clues that touch a single card.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Greedy": // 5
		if len(cardsTouched) < 2 { // nolint: gomnd
			msg := fmt.Sprintf(
				"You are %v, so you can only give clues that touch 2+ cards.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Picky": // 6
		if (clue.Type == constants.ClueTypeRank && clue.Value%2 == 0) ||
			(clue.Type == constants.ClueTypeColor && (clue.Value+1)%2 == 0) {

			msg := fmt.Sprintf(
				"You are %v, so you can only clue odd numbers or odd colors.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Spiteful": // 7
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

	case "Insolent": // 8
		rightIndex := p.Index - 1
		if rightIndex == -1 {
			rightIndex = len(g.Players) - 1
		}
		if d.target == rightIndex {
			msg := fmt.Sprintf("You are %v, so you cannot clue the player to your right.", p.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Miser": // 10
		if g.ClueTokens < t.Variant.GetAdjustedClueTokens(4) {
			msg := fmt.Sprintf(
				"You are %v, so you cannot give a clue unless there are 4 or more clues available.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Compulsive": // 11
		if !p2.isFirstCardTouchedByClue(clue) && !p2.isLastCardTouchedByClue(clue) {
			msg := fmt.Sprintf(
				"You are %v, so you can only give a clue if it touches either the newest or oldest card in a hand.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Mood Swings": // 12
		if constants.ClueType(p.CharacterMetadata) == clue.Type {
			msg := fmt.Sprintf(
				"You are %v, so cannot give the same clue type twice in a row.",
				p.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Insistent": // 13
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

	case "Genius": // 24
		if p.CharacterMetadata == -1 {
			if g.ClueTokens < t.Variant.GetAdjustedClueTokens(2) {
				msg := fmt.Sprintf(
					"You are %v, so there needs to be at least two clues available for you to give a clue.",
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

func (m *Manager) charactervalidateClueReceiver(d *actionData, p2 *gamePlayer) bool {
	// Local variables
	clue := types.NewClue(d.actionType, d.value) // Convert the incoming data to a clue object

	switch p2.Character {
	case "Vulnerable": // 14
		if clue.Type == constants.ClueTypeRank &&
			(clue.Value == 2 || clue.Value == 5) {

			msg := fmt.Sprintf(
				"You cannot give a number 2 or number 5 clue to a %v character.",
				p2.Character,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

	case "Color-Blind": // 15
		if clue.Type == constants.ClueTypeColor {
			msg := fmt.Sprintf("You cannot give that color clue to a %v character.", p2.Character)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	return true
}
