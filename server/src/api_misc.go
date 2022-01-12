package main

import (
	"net"
	"net/http"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

type APISortColumn struct {
	Column    string
	Ascending bool
}

type APIColumnDescription struct {
	Column string
	Value  string
}

type APIQueryVars struct {
	Page    int
	Size    int
	Order   APIColumnDescription
	Filters []APIColumnDescription
}

// Filters the query vars and returns only the valid ones
//     Page    int (min 0, default 0)
//     Size    int (min 0, max 100, default 10)
//     Order   {Name: string, Order: ASC|DESC}
//     Filters {column_name: filter, ...}
func apiParseQueryVars(c *gin.Context, orderCols []string, filterCols []string, defaultSort APISortColumn, initialFilter APIColumnDescription) APIQueryVars {
	return APIQueryVars{
		Page:    apiGetPage(c),
		Size:    apiGetSize(c),
		Order:   apiGetOrder(c, orderCols, defaultSort),
		Filters: apiGetFilters(c, filterCols, initialFilter),
	}
}

// Searches query vars for param "page"
// Returns 0 or positive int
// Default 0
func apiGetPage(c *gin.Context) int {
	if page, err := strconv.Atoi(c.Query("page")); err == nil {
		return max(0, page)
	}
	return 0
}

// Searches query vars for param "size"
// Returns 0 or positive int up to 100
// Default 10
func apiGetSize(c *gin.Context) int {
	if size, err := strconv.Atoi(c.Query("size")); err == nil {
		return between(size, 0, 100, 10)
	}
	return 10
}

// Searches query vars for param "col[int]=0|1"
// Returns valid sort column and order
// Default the given default sort
func apiGetOrder(c *gin.Context, columns []string, defaultSort APISortColumn) APIColumnDescription {
	vars := c.QueryMap("col")
	defOrder := "ASC"
	if !defaultSort.Ascending {
		defOrder = "DESC"
	}

	for key, order := range vars {
		if col, err := strconv.Atoi(key); err == nil && col < len(columns) {
			if order == "0" {
				order = "ASC"
			} else {
				order = "DESC"
			}
			return APIColumnDescription{
				Column: columns[col],
				Value:  order,
			}
		}
	}
	return APIColumnDescription{Column: defaultSort.Column, Value: defOrder}
}

// Searches query vars for param "fcol[int]=string" array
// Skips empty columns
// Returns valid (existing) filters
// Default empty filter
func apiGetFilters(c *gin.Context, columns []string, initialFilter APIColumnDescription) []APIColumnDescription {
	filters := make([]APIColumnDescription, 0)
	if initialFilter.Column != "" {
		filters = append(filters, initialFilter)
	}

	values := c.QueryMap("fcol")
	for key, value := range values {
		if col, err := strconv.Atoi(key); err == nil && col < len(columns) && columns[col] != "" {
			filters = append(filters, APIColumnDescription{Column: columns[col], Value: value})
		}
	}
	return filters
}

// Builds an SQL subquery
// Returns the WHERE part, the ORDER BY part and the args
func apiBuildSubquery(params APIQueryVars) (string, string, string, []interface{}) {
	where := ""
	args := []interface{}{}

	for _, filter := range params.Filters {
		if apiIsNumeric(filter.Value) {
			args = append(args, filter.Value)
			where += filter.Column + " = $" + strconv.Itoa(len(args))
		} else if filter.Value != "" {
			args = append(args, filter.Value)
			where += filter.Column + " = $" + strconv.Itoa(len(args))
		}
		where += " AND "
	}
	if where != "" {
		where = `
		WHERE
			` + where[:len(where)-len(" AND ")]
	}

	orderBy := `
		ORDER BY ` + params.Order.Column + " " + params.Order.Value
	limit := `
		LIMIT ` + strconv.Itoa(params.Size) + `
		OFFSET ` + strconv.Itoa(params.Page*params.Size)

	return where, orderBy, limit, args
}

func apiSetRoutes(httpRouter *gin.Engine) {
	api := "/api/v1"

	// List of variants available
	httpRouter.GET(api+"/variants", apiVariants)

	// List of games by variant
	httpRouter.GET(api+"/variants/:id", apiVariantsSingle)

	// List of games played by player[s]
	httpRouter.GET(api+"/history/:player1", apiHistory)
	httpRouter.GET(api+"/history/:player1/:player2", apiHistory)
	httpRouter.GET(api+"/history/:player1/:player2/:player3", apiHistory)
	httpRouter.GET(api+"/history/:player1/:player2/:player3/:player4", apiHistory)
	httpRouter.GET(api+"/history/:player1/:player2/:player3/:player4/:player5", apiHistory)
	httpRouter.GET(api+"/history/:player1/:player2/:player3/:player4/:player5/:player6", apiHistory)

	// List of games played by player[s] (full game data)
	httpRouter.GET(api+"/history-full/:player1", apiFullDataHistory)
	httpRouter.GET(api+"/history-full/:player1/:player2", apiFullDataHistory)
	httpRouter.GET(api+"/history-full/:player1/:player2/:player3", apiFullDataHistory)
	httpRouter.GET(api+"/history-full/:player1/:player2/:player3/:player4", apiFullDataHistory)
	httpRouter.GET(api+"/history-full/:player1/:player2/:player3/:player4/:player5", apiFullDataHistory)
	httpRouter.GET(api+"/history-full/:player1/:player2/:player3/:player4/:player5/:player6", apiFullDataHistory)

	// List of games played by seed
	httpRouter.GET(api+"/seed/:seed", apiSeed)

	// List of games played by seed (full data)
	httpRouter.GET(api+"/seed-full/:seed", apiFullDataSeed)
}

// Checks if a string contains a numeric value
func apiIsNumeric(s string) bool {
	if _, err := strconv.Atoi(s); err == nil {
		return true
	}
	return false
}

func apiCheckIPBanned(c *gin.Context) bool {
	if banned, err := IsIPBanned(c.Request.RemoteAddr); err != nil {
		c.JSON(http.StatusInternalServerError, "")
		return true
	} else if banned {
		c.JSON(http.StatusBadRequest, "Your IP address has been banned. "+
			"Please contact an administrator if you think this is a mistake.")
		return true
	}
	return false
}

func IsIPBanned(remoteAddr string) (bool, error) {
	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(remoteAddr); err != nil {
		logger.Error("Failed to parse the IP address from \"" + remoteAddr + "\": " + err.Error())
		return false, err
	} else {
		ip = v
	}

	// Check to see if their IP is banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \"" + ip + "\" is banned: " + err.Error())
		return false, err
	} else if banned {
		logger.Info("IP \"" + ip + "\" tried to log in, but they are banned.")
		return true, nil
	}
	return false, nil
}
