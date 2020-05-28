package main

import (
	"strconv"
	"time"
)

// commandHistoryGetDeals is sent when the user clicks on the "Compare Scores" button
//
// Example data:
// {
//   gameID: 15103,
// }
func commandHistoryGetDeals(s *Session, d *CommandData) {
	var historyListDatabase []*GameHistory
	if v, err := models.Games.GetAllDealsFromGameID(d.GameID); err != nil {
		logger.Error("Failed to get the deals from the database for game "+
			strconv.Itoa(d.GameID)+":", err)
		s.Error("Failed to get the deals for game " + strconv.Itoa(d.GameID) + ". " +
			"Please contact an administrator.")
		return
	} else {
		historyListDatabase = v
	}

	type GameHistoryOtherScoresMessage struct {
		ID                   int       `json:"id"`
		NumPlayers           int       `json:"numPlayers"`
		Timed                bool      `json:"timed"`
		TimeBase             int       `json:"timeBase"`
		TimePerTurn          int       `json:"timePerTurn"`
		Speedrun             bool      `json:"speedrun"`
		CardCycle            bool      `json:"cardCycle"`
		DeckPlays            bool      `json:"deckPlays"`
		EmptyClues           bool      `json:"emptyClues"`
		CharacterAssignments bool      `json:"characterAssignments"`
		Seed                 string    `json:"seed"`
		Score                int       `json:"score"`
		NumTurns             int       `json:"numTurns"`
		EndCondition         int       `json:"endCondition"`
		DatetimeStarted      time.Time `json:"datetimeStarted"`
		DatetimeFinished     time.Time `json:"datetimeFinished"`
		PlayerNames          string    `json:"playerNames"`
	}
	historyList := make([]*GameHistoryOtherScoresMessage, 0)
	for _, g := range historyListDatabase {
		historyList = append(historyList, &GameHistoryOtherScoresMessage{
			ID:                   g.ID,
			NumPlayers:           g.NumPlayers,
			Timed:                g.Timed,
			TimeBase:             g.TimeBase,
			TimePerTurn:          g.TimePerTurn,
			Speedrun:             g.Speedrun,
			CardCycle:            g.CardCycle,
			DeckPlays:            g.DeckPlays,
			EmptyClues:           g.EmptyClues,
			CharacterAssignments: g.CharacterAssignments,
			Seed:                 g.Seed,
			Score:                g.Score,
			NumTurns:             g.NumTurns,
			EndCondition:         g.EndCondition,
			DatetimeStarted:      g.DatetimeStarted,
			DatetimeFinished:     g.DatetimeFinished,
			PlayerNames:          g.PlayerNames,
		})
	}
	s.Emit("gameHistoryOtherScores", &historyList)
}
