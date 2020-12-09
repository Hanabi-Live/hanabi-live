package models

import (
	"context"
	"os"
	"strconv"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/jackc/pgx/v4/pgxpool"
)

// Models contains a list of interfaces representing database tables
type Models struct {
	BannedIPs
	ChatLog
	ChatLogPM
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

	db              *pgxpool.Pool
	logger          *logger.Logger
	variantsManager *variants.Manager
}

// NewModels opens a database connection based on the credentials in the ".env" file
func NewModels(
	ctx context.Context,
	logger *logger.Logger,
	variantsManager *variants.Manager,
) (*Models, error) {
	models := &Models{}

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
	if _, err := strconv.Atoi(dbPort); err != nil {
		logger.Fatalf(
			"Failed to convert the \"DB_PORT\" environment variable of \"%v\" to an integer: %v",
			dbPort,
			err,
		)
	}
	dbUser := os.Getenv("DB_USER")
	if len(dbUser) == 0 {
		defaultUser := "hanabiuser"
		logger.Infof("DB_USER not specified; using default value of: %v", defaultUser)
		dbUser = defaultUser
	}
	dbPass := os.Getenv("DB_PASS")
	if len(dbPass) == 0 {
		defaultPass := "1234567890"
		logger.Infof("DB_PASS not specified; using default value of: %v", defaultPass)
		dbPass = defaultPass
	}
	dbName := os.Getenv("DB_NAME")
	if len(dbName) == 0 {
		defaultName := "hanabi"
		logger.Infof("DB_NAME not specified; using default value of: %v", defaultName)
		dbName = defaultName
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
	if v, err := pgxpool.Connect(ctx, dsn); err != nil {
		return nil, err
	} else {
		models.db = v
	}

	// Populate all of the reverse references
	models.BannedIPs.m = models
	models.ChatLog.m = models
	models.ChatLogPM.m = models
	models.GameActions.m = models
	models.GameParticipantNotes.m = models
	models.GameParticipants.m = models
	models.Games.m = models
	models.GameTags.m = models
	models.Metadata.m = models
	models.MutedIPs.m = models
	models.Seeds.m = models
	models.Users.m = models
	models.UserFriends.m = models
	models.UserReverseFriends.m = models
	models.UserSettings.m = models
	models.UserStats.m = models
	models.VariantStats.m = models

	// Store references to dependencies
	models.logger = logger
	models.variantsManager = variantsManager

	// Create the model
	return models, nil
}

// Close exposes the ability to close the underlying database connection
func (m *Models) Close() {
	m.db.Close()
}
