package main

import (
	"context"
	"os"
	"strings"

	"github.com/jackc/pgx/v4"
)

var (
	db     *pgx.Conn
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
	Metadata
	MutedIPs
	Users
	UserFriends
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
		// 5432 is the default port for PostgreSQL
		dbPort = "5432"
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
		"pass=" + dbPass,
		"dbname=" + dbName,
		// Needed for PgBouncer; see https://github.com/jackc/pgx/issues/650
		"statement_cache_mode=describe",
	}
	dsn := strings.Join(dsnArray, " ")
	if v, err := pgx.Connect(context.Background(), dsn); err != nil {
		return nil, err
	} else {
		db = v
	}

	// Create the model
	return &Models{}, nil
}

// Close exposes the ability to close the underlying database connection
func (*Models) Close() {
	if err := db.Close(context.Background()); err != nil {
		logger.Fatal("Failed to close the database connection:", err)
	}
}
