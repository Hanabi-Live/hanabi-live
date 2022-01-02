package main

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

type APIVariantRow struct {
	ID         int    `json:"id"`
	NumPlayers int    `json:"num_players"`
	Score      int    `json:"score"`
	Users      string `json:"users"`
	DateTime   string `json:"datetime"`
}

type APIVariantAnswer struct {
	TotalRows int             `json:"total_rows"`
	Info      string          `json:"info"`
	Rows      []APIVariantRow `json:"rows"`
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
	var id int
	if v, err := apiGetVariantIDFromParam(c); err != nil {
		c.JSON(http.StatusBadRequest, APIVariantAnswer{
			TotalRows: 0,
			Info:      "Missing valid variant ID",
			Rows:      nil,
		})
		return
	} else {
		id = v
	}

	defaultSort := APISortColumn{Column: "games.id", Order: 1}
	initialFilter := APIColumnDescription{Column: "variant_id", Value: strconv.Itoa(id)}
	orderCols := []string{"games.id"}
	filterCols := []string{"games.id", "num_players", "score"}

	var rows pgx.Rows

	// Filter & sanitize
	params := apiParseQueryVars(c, orderCols, filterCols, defaultSort, initialFilter)
	wQuery, orderBy, limit, args := apiBuildSubquery(params)

	// Get row count
	var rowCount int
	dbQuery := "SELECT COUNT(*) FROM games " + wQuery
	if err := db.QueryRow(context.Background(), dbQuery, args...).Scan(&rowCount); err != nil {
		c.JSON(http.StatusBadRequest, APIVariantAnswer{})
		return
	}

	// Get game IDs
	var gameIDs []int
	dbQuery = "SELECT games.id FROM games " + wQuery + orderBy + limit
	if v, err := db.Query(context.Background(), dbQuery, args...); err != nil {
		c.JSON(http.StatusBadRequest, APIVariantAnswer{})
		return
	} else {
		rows = v
	}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			c.JSON(http.StatusBadRequest, APIVariantAnswer{})
			return
		}
		gameIDs = append(gameIDs, id)
	}

	// Get results - we only need WHERE for games.id
	var dbRows []APIVariantRow
	if v, err := models.Games.GetGamesForVariantFromGameIDs(gameIDs, orderBy); err != nil {
		c.JSON(http.StatusBadRequest, APIVariantAnswer{})
		return
	} else {
		dbRows = v
	}

	info := "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 1: num_players, 2: score)"

	out := APIVariantAnswer{
		TotalRows: rowCount,
		Info:      info,
		Rows:      dbRows,
	}

	c.JSON(http.StatusOK, out)
}

// Returns valid variant ID
func apiGetVariantIDFromParam(c *gin.Context) (int, error) {
	if v, err := httpGetIntVariable(c, "id"); err != nil {
		return 0, err
	} else if !variantsIsValidID(v) {
		return 0, err
	} else {
		return v, nil
	}
}
