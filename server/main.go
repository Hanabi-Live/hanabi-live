package main // In Go, executable commands must always use package main

// This file contains the entry point for the server software

/*

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/sessions"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/sasha-s/go-deadlock"
)

var (
	isDev   bool
	hLogger *logger.Logger

	projectName       string
	projectPath       string
	dataPath          string
	versionPath       string
	tablesPath        string
	specificDealsPath string
	usingSentry       bool

	sessionsManager *sessions.Manager
	variantsManager *variants.Manager
	models          *Models
	tables          = NewTables() // An object that tracks ongoing tables
)

func main() {
	if os.Getenv("DOMAIN") == "" ||
		os.Getenv("DOMAIN") == "localhost" ||
		strings.HasPrefix(os.Getenv("DOMAIN"), "192.168.") ||
		strings.HasPrefix(os.Getenv("DOMAIN"), "10.") {

		isDev = true
	}

	// Initialize logging (in "logger.go")
	hLogger = logger.New(isDev)
	defer hLogger.Sync()

	// Configure the deadlock detector
	deadlock.Opts.DisableLockOrderDetection = true

	// Get the project path
	// https://stackoverflow.com/questions/18537257/
	if v, err := os.Executable(); err != nil {
		hLogger.Fatalf("Failed to get the path of the currently running executable: %v", err)
	} else {
		// We use "filepath.Dir()" instead of "path.Dir()" because it is platform independent
		projectName = filepath.Base(v)
		projectPath = filepath.Dir(v)
	}

	// Welcome message
	startText := fmt.Sprintf("| Starting %v |", projectName)
	hyphens := strings.Repeat("-", len(startText)-2)
	borderText := fmt.Sprintf("+%v+", hyphens)
	hLogger.Info(borderText)
	hLogger.Info(startText)
	hLogger.Info(borderText)

	// Check to see if the data path exists
	dataPath = path.Join(projectPath, "data")
	if _, err := os.Stat(dataPath); os.IsNotExist(err) {
		hLogger.Fatalf(
			"The data directory of \"%v\" does not exist. This directory should always exist; please try re-cloning the repository.",
			dataPath,
		)
	} else if err != nil {
		hLogger.Fatalf("Failed to check if the \"%v\" file exists: %v", dataPath, err)
	}

	// Check to see if the version file exists
	// (which informs us about what the version the client is currently compiled at)
	versionPath = path.Join(projectPath, "public", "js", "bundles", "version.txt")
	if _, err := os.Stat(versionPath); os.IsNotExist(err) {
		hLogger.Fatalf(
			"The \"%v\" file does not exist. Did you run the \"install_dependencies.sh\" script before running the server? This file should automatically be created when building the client.",
			versionPath,
		)
	} else if err != nil {
		hLogger.Fatalf("Failed to check if the \"%v\" file exists: %v", versionPath, err)
	}

	// Check to see if the "ongoing_tables" directory exists
	tablesPath = path.Join(dataPath, "ongoing_tables")
	if _, err := os.Stat(tablesPath); os.IsNotExist(err) {
		if err2 := os.MkdirAll(tablesPath, 0755); err2 != nil {
			hLogger.Fatalf("Failed to create the \"%v\" directory: %v", tablesPath, err2)
		}
	} else if err != nil {
		hLogger.Fatalf("Failed to check if the \"%v\" file exists: %v", tablesPath, err)
	}

	// Check to see if the "specific_deals" directory exists
	specificDealsPath = path.Join(dataPath, "specific_deals")
	if _, err := os.Stat(specificDealsPath); os.IsNotExist(err) {
		if err2 := os.MkdirAll(specificDealsPath, 0755); err2 != nil {
			hLogger.Fatalf("Failed to create the \"%v\" directory: %v", specificDealsPath, err2)
		}
	} else if err != nil {
		hLogger.Fatalf("Failed to check if the \"%v\" file exists: %v", specificDealsPath, err)
	}

	// Check to see if the ".env" file exists
	envPath := path.Join(projectPath, ".env")
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		hLogger.Fatalf(
			"The \"%v\" file does not exist. Did you run the \"install_dependencies.sh\" script before running the server? This file should automatically be created when running this script.",
			envPath,
		)
	} else if err != nil {
		hLogger.Fatalf("Failed to check if the \"%v\" file exists: %v", envPath, err)
	}

	// Load the ".env" file, which contains environment variables with secret values
	if err := godotenv.Load(envPath); err != nil {
		hLogger.Fatalf("Failed to load the \".env\" file: %v", err)
	}

	// Initialize Sentry (in "sentry.go")
	usingSentry = sentryInit()
	if usingSentry {
		// Tell the logger to report critical events to Sentry
		hLogger.EnableSentry()

		// Flush buffered events before the program terminates
		// https://github.com/getsentry/sentry-go
		defer sentry.Flush(2 * time.Second)
	}

	// New stuff
	// TODO ADD MORE
	sessionsManager = sessions.NewManager(hLog)
	variantsManager = variants.NewManager(hLog, dataPath)

	// Initialize the database model (in "models.go")
	if v, err := modelsInit(); err != nil {
		hLogger.Fatalf("Failed to open the database: %v", err)
	} else {
		models = v
	}
	defer models.Close()

	// Validate that the database exists
	if err := models.Metadata.TestDatabase(); err != nil {
		if strings.Contains(err.Error(), "Unknown database") {
			hLogger.Fatal("The database does not exist. Please follow the instructions located in the \"docs/INSTALL.md\" file in order to set up the database.")
		}

		hLogger.Errorf("Failed to run the database test query: %v", err)
		hLogger.Fatal("Try re-running the \"install/install_database_schema.sh\" script in order to re-initialize the database.")
	}

	colorsInit()   // (in "colors.go")
	suitsInit()    // (in "suits.go")
	variantsInit() // (in "variants.go")

	// Initialize the action functions command map (in "command_action.go")
	actionsFunctionsInit()

	// Initialize the replay action functions command map (in "command_replay_action.go")
	replayActionsFunctionsInit()

	// Initialize "Detrimental Character Assignments" (in "characters.go")
	charactersInit()

	// Initialize the list that contains every word in the dictionary
	wordListInit()

	// Start the managers
	// go sessionsManagerInit()
	// go tablesManagerInit()

	// Start the Discord bot (in "discord.go")
	discordInit()

	// Start the GitHub bot (in "github.go")
	githubInit()

	// Initialize a WebSocket router using the Melody framework (in "websocket.go")
	websocketInit()

	// Initialize chat commands (in "chatCommand.go")
	chatCommandInit()

	// Restore tables that were ongoing at the time of the last server restart
	restoreTables()

	// Specify that we are running the HTTP framework in production
	// (it is "gin.DebugMode" by default)
	// Comment this out to debug HTTP stuff
	// This must be done before spawning the localhost goroutine in order to prevent race conditions
	gin.SetMode(gin.ReleaseMode)

	// Initialize an HTTP router that will only listen locally for maintenance-related commands
	// (in "httpLocalhost.go")
	// (the "ListenAndServe" functions located inside here are blocking)
	go httpLocalhostInit()

	// Initialize an HTTP router using the Gin framework (in "http.go")
	// (the "ListenAndServe" functions located inside here are blocking)
	httpInit()
}

*/
