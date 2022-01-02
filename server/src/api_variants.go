package main

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

type ApiVariantRow struct {
	ID         int    `json:"id"`
	NumPlayers int    `json:"num_players"`
	Score      int    `json:"score"`
	Users      string `json:"users"`
	DateTime   string `json:"datetime"`
}

type ApiVariantAnswer struct {
	TotalRows int             `json:"total_rows"`
	Info      string          `json:"info"`
	Rows      []ApiVariantRow `json:"rows"`
}

// List of variants
//   /api/v1/variants
//
//   Columns
//   id   int
//   name string
func apiVariants(c *gin.Context) {
	c.JSON(http.StatusOK, variantIDMap)
}

// Returns list of games of given variant
//   URL: /api/v1/variants/:id
//
//   Columns
//   id                int
//   num_players       int
//   score             int
//   users             string
//   datetime          string
//
//   Order
//   0: id
//
//   Filters
//   0: id
//   1: num_players
//   2: score
func apiVariantsSingle(c *gin.Context) {
	// Validate the id
	id, err := apiGetVariantIdFromParam(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, ApiVariantAnswer{Info: "Missing valid variant ID"})
		return
	}

	defaultSort := ApiSortColumn{Column: "games.id", Order: 1}
	initialFilter := ApiColumnDescription{Column: "variant_id", Value: strconv.Itoa(id)}
	orderCols := []string{"games.id"}
	filterCols := []string{"games.id", "num_players", "score"}

	var rows pgx.Rows

	// Filter & sanitize
	params := apiParseQueryVars(c, orderCols, filterCols, defaultSort, initialFilter)
	wQuery, orderBy, limit, args := apiBuildSubquery(params)

	// Get row count
	var rowCount int
	dbQuery := "SELECT COUNT(*) FROM games " + wQuery
	db.QueryRow(context.Background(), dbQuery, args...).Scan(&rowCount)

	// Get game IDs
	var gameIDs []int
	dbQuery = "SELECT games.id FROM games " + wQuery + orderBy + limit
	if v, err := db.Query(context.Background(), dbQuery, args...); err != nil {
		c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
		return
	} else {
		rows = v
	}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
			return
		}
		gameIDs = append(gameIDs, id)
	}

	// Get results - we only need WHERE for games.id
	dbRows, err := models.Games.GetGamesForVariantFromGameIDs(gameIDs, orderBy)

	if err != nil {
		c.JSON(http.StatusBadRequest, ApiVariantAnswer{})
		return
	}

	info := "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 1: num_players, 2: score)"

	out := ApiVariantAnswer{
		TotalRows: rowCount,
		Info:      info,
		Rows:      dbRows,
	}

	c.JSON(http.StatusOK, out)
}

// Returns valid variant ID
func apiGetVariantIdFromParam(c *gin.Context) (int, error) {
	if v, err := httpGetIntVariable(c, "id"); err != nil {
		return 0, err
	} else if !variantsIsValidId(v) {
		return 0, err
	} else {
		return v, nil
	}
}
