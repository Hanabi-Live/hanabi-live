package main

import (
	"database/sql"
	"os"

	// This is the documented way to use the driver
	_ "github.com/go-sql-driver/mysql"
)

var (
	db     *sql.DB
	dbName string
)

// Models contains a list of interfaces representing database tables
type Models struct {
	BannedIPs
	ChatLog
	DiscordMetadata
	DiscordWaiters
	GameActions
	GameActions2
	GameParticipants
	Games
	Users
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
		// 3306 is the default port for MariaDB
		dbPort = "3306"
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
	// We need to set parseTime to true so that we can scan DATETIME fields into time.Time variables
	// See: https://github.com/go-sql-driver/mysql
	dsn := dbUser + ":" + dbPass + "@(" + dbHost + ":" + dbPort + ")/" + dbName + "?parseTime=true"
	if v, err := sql.Open("mysql", dsn); err != nil {
		return nil, err
	} else {
		db = v
	}

	// Create the model
	return &Models{}, nil
}

// Close exposes the ability to close the underlying database connection
func (*Models) Close() {
	if err := db.Close(); err != nil {
		logger.Fatal("Failed to close the database connection:", err)
	}
}
