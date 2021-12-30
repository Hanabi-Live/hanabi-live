package main

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

type ApiSortColumn struct {
	Column string
	Order  int // 0 ASC, 1 DESC
}

type ApiColumnDescription struct {
	Column string
	Value  string
	Values []string
}

type ApiQueryVars struct {
	Page    int
	Size    int
	Order   ApiColumnDescription
	Filters []ApiColumnDescription
}

// Filters the query vars and returns only the valid ones
//     Page    int (min 0, default 0)
//     Size    int (min 0, max 100, default 10)
//     Order   {Name: string, Order: ASC|DESC}
//     Filters {column_name: filter, ...}
func apiParseQueryVars(c *gin.Context, orderCols []string, filterCols []string, defaultSort ApiSortColumn, initialFilter ApiColumnDescription) ApiQueryVars {
	return ApiQueryVars{
		Page:    apiGetPage(c),
		Size:    apiGetSize(c),
		Order:   apiGetOrder(c, orderCols, defaultSort),
		Filters: apiGetFilters(c, filterCols, initialFilter),
	}
}

// Searches query vars for param "page"
// Returns 0 or positive int
func apiGetPage(c *gin.Context) int {
	if page, err := strconv.Atoi(c.Query("page")); err == nil {
		return max(0, page)
	}
	return 0
}

// Searches query vars for param "size"
// Returns 0 or positive int up to 100, default 10
func apiGetSize(c *gin.Context) int {
	if size, err := strconv.Atoi(c.Query("size")); err == nil {
		return between(size, 0, 100, 10)
	}
	return 10
}

// Searches query vars for param "col[int]=0|1"
// Returns valid sort column and order
func apiGetOrder(c *gin.Context, columns []string, defaultSort ApiSortColumn) ApiColumnDescription {
	vars := c.QueryMap("col")
	defOrder := "ASC"
	if defaultSort.Order != 0 {
		defOrder = "DESC"
	}

	for key, order := range vars {
		if col, err := strconv.Atoi(key); err == nil && col < len(columns) {
			if order == "0" {
				order = "ASC"
			} else {
				order = "DESC"
			}
			return ApiColumnDescription{
				Column: columns[col],
				Value:  order,
			}
		}
	}
	return ApiColumnDescription{Column: defaultSort.Column, Value: defOrder}
}

// Searches query vars for param "fcol[int]=string" array. Skips empty cols. Returns valid (existing) filters
func apiGetFilters(c *gin.Context, columns []string, initialFilter ApiColumnDescription) []ApiColumnDescription {
	filters := make([]ApiColumnDescription, 0)
	if initialFilter.Column != "" {
		filters = append(filters, initialFilter)
	}

	values := c.QueryMap("fcol")
	for key, value := range values {
		if col, err := strconv.Atoi(key); err == nil && col < len(columns) && columns[col] != "" {
			filters = append(filters, ApiColumnDescription{Column: columns[col], Value: value})
		}
	}
	return filters
}

// Builds an SQL subquery. Returns the WHERE part, the ORDER BY part and the args
func apiBuildSubquery(params ApiQueryVars) (string, string, string, []interface{}) {
	where := ""
	args := []interface{}{}

	for _, filter := range params.Filters {
		if apiIsNumeric(filter.Value) {
			args = append(args, filter.Value)
			where += filter.Column + " = $" + strconv.Itoa(len(args))
		} else if filter.Values != nil {
			where += filter.Column + " IN ("
			for i := 0; i < len(filter.Values); i++ {
				args = append(args, filter.Values[i])
				where += "$" + strconv.Itoa(len(args)) + ", "
			}
			where = where[:len(where)-len(", ")] + ")"
		} else {
			args = append(args, "%"+filter.Value+"%")
			where += filter.Column + " ILIKE $" + strconv.Itoa(len(args))
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
}

// Checks if a string contains a numeric value
func apiIsNumeric(s string) bool {
	if _, err := strconv.Atoi(s); err == nil {
		return true
	}
	return false
}
