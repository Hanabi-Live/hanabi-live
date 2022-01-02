package main

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type ApiGamesRow struct {
	ID          int    `json:"id"`
	NumPlayers  int    `json:"num_players"`
	Score       int    `json:"score"`
	Variant     int    `json:"variant"`
	Users       string `json:"users"`
	DateTime    string `json:"datetime"`
	Seed        string `json:"seed"`
	OtherScores int    `json:"other_scores"`
}

type ApiGamesAnswer struct {
	TotalRows int        `json:"total_rows"`
	Info      string     `json:"info"`
	Rows      []GamesRow `json:"rows"`
}

// Returns list of games for given player[s]
//   URL: /api/v1/history/:player1 [/:player2...]
//
//   Columns:
//   game_id       int
//   no_of_players int
//   score         int
//   variant       string (link: /variant/id)
//   date & time   datetime
//   players       []string (link: /history/[]p)
//   other scores  int (link: /seed/id)
//
//   Order
//   0: games.id
//
//   Filters
//   0: games.id
//   1: num_players
//   2: score
//   3: variant_id
func apiHistory(c *gin.Context) {
	// Parse the player name(s) from the URL
	var playerIDs []int
	if v1, _, ok := httpParsePlayerNames(c); !ok {
		c.JSON(http.StatusBadRequest, ApiGamesAnswer{})
		return
	} else {
		playerIDs = v1
	}

	defaultSort := ApiSortColumn{Column: "games.id", Order: 1}
	orderCols := []string{"games.id"}
	filterCols := []string{"games.id", "num_players", "score", "variant_id"}

	// Filter & sanitize
	params := apiParseQueryVars(c, orderCols, filterCols, defaultSort, ApiColumnDescription{})
	wQuery, orderBy, limit, args := apiBuildSubquery(params)

	SQLString := ""
	for _, id := range playerIDs {
		idString := strconv.Itoa(id)
		SQLString += `
		JOIN game_participants AS player` + idString + "_games "
		SQLString += "ON games.id = player" + idString + "_games.game_id "
		SQLString += "AND player" + idString + "_games.user_id = " + idString + " "
	}

	// Get row count
	var rowCount int
	dbQuery := "SELECT COUNT(DISTINCT games.id) FROM games " + SQLString + wQuery
	db.QueryRow(context.Background(), dbQuery, args...).Scan(&rowCount)

	// Get game IDs
	gameIDs, err := models.Games.GetGameIDsMultiUser(playerIDs, wQuery, orderBy, limit, args)
	if err != nil {
		c.JSON(http.StatusBadRequest, ApiGamesAnswer{})
		return
	}
	apiGames(c, rowCount, gameIDs, orderBy)
}

func apiGames(c *gin.Context, rowCount int, gameIDs []int, orderBy string) {
	// Get results
	dbRows, err := models.Games.GetGamesForHistoryFromGameIDs(gameIDs, orderBy)

	if err != nil {
		c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
		return
	}

	info := "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 1: num_players, 2: score, 3: variant_id)"

	out := ApiGamesAnswer{
		TotalRows: rowCount,
		Info:      info,
		Rows:      dbRows,
	}

	c.JSON(http.StatusOK, out)
}
