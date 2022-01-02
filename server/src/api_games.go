package main

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type APIGamesAnswer struct {
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
		c.JSON(http.StatusBadRequest, APIGamesAnswer{})
		return
	} else {
		playerIDs = v1
	}

	defaultSort := APISortColumn{Column: "games.id", Ascending: false}
	orderCols := []string{"games.id"}
	filterCols := []string{"games.id", "num_players", "score", "variant_id"}

	// Filter & sanitize
	params := apiParseQueryVars(c, orderCols, filterCols, defaultSort, APIColumnDescription{})
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
	if err := db.QueryRow(context.Background(), dbQuery, args...).Scan(&rowCount); err != nil {
		c.JSON(http.StatusBadRequest, APIGamesAnswer{})
		return
	}

	// Get game IDs
	gameIDs, err := models.Games.GetGameIDsMultiUser(playerIDs, wQuery, orderBy, limit, args)
	if err != nil {
		c.JSON(http.StatusBadRequest, APIGamesAnswer{})
		return
	}
	apiGames(c, rowCount, gameIDs, orderBy)
}

// Returns list of games for given seed
//   URL: /api/v1/seed/:seed
//
//   Columns:
//   game_id       int
//   no_of_players int
//   score         int
//   variant       string (link: /variant/id)
//   date & time   datetime
//   players       []string (link: /history/[]p)
//
//   Order
//   0: games.id
//
//   Filters
//   0: games.id
//   2: score
func apiSeed(c *gin.Context) {
	// Parse the seed from the URL
	seed := c.Param("seed")
	if seed == "" {
		c.JSON(http.StatusBadRequest, APIGamesAnswer{})
		return
	}

	defaultSort := APISortColumn{Column: "games.id", Ascending: false}
	initialFilter := APIColumnDescription{Column: "seed", Value: seed}
	orderCols := []string{"games.id"}
	filterCols := []string{"games.id", "", "score"}

	// Filter & sanitize
	params := apiParseQueryVars(c, orderCols, filterCols, defaultSort, initialFilter)
	wQuery, orderBy, limit, args := apiBuildSubquery(params)

	// Get row count
	var rowCount int
	dbQuery := "SELECT COUNT(DISTINCT games.id) FROM games " + wQuery
	if err := db.QueryRow(context.Background(), dbQuery, args...).Scan(&rowCount); err != nil {
		c.JSON(http.StatusBadRequest, APIGamesAnswer{})
		return
	}

	// Get game IDs
	gameIDs, err := models.Games.GetGameIDsForSeed(wQuery, orderBy, limit, args)
	if err != nil {
		c.JSON(http.StatusBadRequest, APIGamesAnswer{})
		return
	}
	apiGames(c, rowCount, gameIDs, orderBy)
}

func apiGames(c *gin.Context, rowCount int, gameIDs []int, orderBy string) {
	// Get results
	dbRows, err := models.Games.GetGamesForHistoryFromGameIDs(gameIDs, orderBy)

	if err != nil {
		c.JSON(http.StatusBadRequest, APIVariantAnswer{})
		return
	}

	info := "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 2: score)"

	out := APIGamesAnswer{
		TotalRows: rowCount,
		Info:      info,
		Rows:      dbRows,
	}

	c.JSON(http.StatusOK, out)
}
