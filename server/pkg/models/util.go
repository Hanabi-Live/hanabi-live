package models

import (
	"fmt"
	"strconv"
	"strings"
)

// getBulkInsertSQL is a helper function to prepare a SQL query for a bulk insert
//
// For example:
//
// SQLString = "INSERT INTO notes (thing_a, thing_b) VALUES %s"
// rowValueSQL  = "?, ?"
// numRows = 3
//
// Would be transformed into:
//
// INSERT INTO notes (thing_a, thing_b)
// VALUES
//     ($1, $2),
//     ($3, $4),
//     ($5, $6)
//
// Also see:
// https://stackoverflow.com/questions/12486436/how-do-i-batch-sql-statements-with-package-database-sql
func getBulkInsertSQL(SQLString string, rowValueSQL string, numRows int) string {
	// Combine the base SQL string and N value strings
	valueStrings := make([]string, 0, numRows)
	for i := 0; i < numRows; i++ {
		valueStrings = append(valueStrings, "("+rowValueSQL+")")
	}
	allValuesString := strings.Join(valueStrings, ",")
	SQLString = fmt.Sprintf(SQLString, allValuesString)

	// Convert all of the "?" to "$1", "$2", "$3", etc.
	// (which is the way that pgx expects query variables to be)
	numArgs := strings.Count(SQLString, "?")
	SQLString = strings.ReplaceAll(SQLString, "?", "$%v")
	numbers := make([]interface{}, 0, numRows)
	for i := 1; i <= numArgs; i++ {
		numbers = append(numbers, strconv.Itoa(i))
	}
	return fmt.Sprintf(SQLString, numbers...)
}

// getBulkInsertSQLSimple is a helper function to prepare a SQL query for a bulk insert
// getBulkInsertSQLSimple is used over getBulkInsertSQL when all of the values are plain question
// marks (e.g. a 1-for-1 value insertion)
// The example given for getBulkInsertSQL is such a query
func getBulkInsertSQLSimple(SQLString string, numArgsPerRow int, numRows int) string {
	questionMarks := make([]string, 0, numArgsPerRow)
	for i := 0; i < numArgsPerRow; i++ {
		questionMarks = append(questionMarks, "?")
	}
	rowValueSQL := strings.Join(questionMarks, ", ")
	return getBulkInsertSQL(SQLString, rowValueSQL, numRows)
}
