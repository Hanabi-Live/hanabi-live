package main

import (
	"context"
	"os"
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
