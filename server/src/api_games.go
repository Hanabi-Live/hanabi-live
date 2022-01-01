package main

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
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
	TotalRows int64         `json:"total_rows"`
	Info      string        `json:"info"`
	Rows      []ApiGamesRow `json:"rows"`
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

	var rows pgx.Rows

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
	var rowCount int64
	dbQuery := "SELECT COUNT(DISTINCT games.id) FROM games " + SQLString + wQuery
	db.QueryRow(context.Background(), dbQuery, args...).Scan(&rowCount)

	// Get game IDs
	var gameIDs []int64
	dbQuery = "SELECT games.id FROM games " + SQLString + wQuery + orderBy + limit
	if v, err := db.Query(context.Background(), dbQuery, args...); err != nil {
		c.JSON(http.StatusBadRequest, "0 "+err.Error())
		// c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
		return
	} else {
		rows = v
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			c.JSON(http.StatusBadRequest, err.Error())
			// c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
			return
		}
		gameIDs = append(gameIDs, id)
	}

	apiGames(c, rowCount, gameIDs, orderBy)
}

func apiGames(c *gin.Context, rowCount int64, gameIDs []int64, orderBy string) {
	// Get results
	var rows pgx.Rows
	args := []interface{}{gameIDs}

	dbQuery := `
		SELECT
			games.id, num_players, score, variant_id,
			STRING_AGG(username, ', ' ORDER BY username) AS usernames,
			TO_CHAR(datetime_finished, 'YYYY-MM-DD" - "HH24:MI:SS TZ') AS finished,
			games.seed as seed,
			MAX(seeds.num_games) as total_games
		FROM
			games
			JOIN game_participants on games.id = game_id
			JOIN users on user_id = users.id
			JOIN seeds ON seeds.seed = games.seed
		WHERE games.id = ANY($1)
		GROUP BY games.id
	` + orderBy

	if v, err := db.Query(context.Background(), dbQuery, args...); err != nil {
		c.JSON(http.StatusBadRequest, []interface{}{
			err.Error(),
			rowCount,
			dbQuery,
		})
		// c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
		return
	} else {
		rows = v
	}

	var dbRows []ApiGamesRow

	for rows.Next() {
		row := ApiGamesRow{}
		if err := rows.Scan(
			&row.ID,
			&row.NumPlayers,
			&row.Score,
			&row.Variant,
			&row.Users,
			&row.DateTime,
			&row.Seed,
			&row.OtherScores,
		); err != nil {
			c.JSON(http.StatusBadRequest, err.Error())
			// c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
			return
		}
		dbRows = append(dbRows, row)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusBadRequest, []interface{}{
			err.Error(),
			rowCount,
			dbQuery,
		})
		// c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
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
