package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v4/pgxpool"
)

var (
	db     *pgxpool.Pool
	dbName string
)

// Models contains a list of interfaces representing database tables
type Models struct {
	BannedIPs
	ChatLog
	ChatLogPM
	DiscordWaiters
	GameActions
	GameParticipantNotes
	GameParticipants
	Games
	GameTags
	Metadata
	MutedIPs
	Seeds
	Users
	UserFriends
	UserReverseFriends
	UserSettings
	UserStats
	VariantStats
}

// modelsInit opens a database connection based on the credentials in the ".env" file
func modelsInit() (*Models, error) {
	// Read the database configuration from environment variables
	// (it was loaded from the .env file in main.go)
	dbHost := os.Getenv("DB_HOST")
	if len(dbHost) == 0 {
		dbHost = "localhost"
	}
	dbPort := os.Getenv("DB_PORT")
	if len(dbPort) == 0 {
		dbPort = "5432" // This is the default port for PostgreSQL
	}
	dbUser := os.Getenv("DB_USER")
	if len(dbUser) == 0 {
		logger.Info("DB_USER not specified; using default value of \"hanabiuser\".")
		dbUser = "hanabiuser"
	}
	dbPass := os.Getenv("DB_PASS")
	if len(dbPass) == 0 {
		logger.Info("DB_PASS not specified; using default value of \"1234567890\".")
		dbPass = "1234567890"
	}
	dbName = os.Getenv("DB_NAME")
	if len(dbPass) == 0 {
		logger.Info("DB_NAME not specified; using default value of \"hanabi\".")
		dbName = "hanabi"
	}

	// Initialize the database
	// The DSN string format is documented at:
	// https://godoc.org/github.com/jackc/pgconn#ParseConfig
	dsnArray := []string{
		"host=" + dbHost,
		"port=" + dbPort,
		"user=" + dbUser,
		"password=" + dbPass,
		"dbname=" + dbName,
	}
	dsn := strings.Join(dsnArray, " ")

	// We use "pgxpool.Connect()" instead of "pgx.Connect()" because the vanilla driver is not safe
	// for concurrent connections (unlike the other Golang SQL drivers)
	// https://github.com/jackc/pgx/wiki/Getting-started-with-pgx
	if v, err := pgxpool.Connect(context.Background(), dsn); err != nil {
		return nil, err
	} else {
		db = v
	}

	// Create the model
	return &Models{}, nil
}

// Close exposes the ability to close the underlying database connection
func (*Models) Close() {
	db.Close()
}

// getBulkInsertSQL is a helper function to prepare a SQL query for a bulk insert
//
// For example:
//
// SQLString = "INSERT INTO notes (thing_a, thing_b) VALUES %s"
// numValues = 3
// numArgs   = 6
// valueSQL  = "?, ?"
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
