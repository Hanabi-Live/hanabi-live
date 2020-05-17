package main // In Go, executable commands must always use package main

// This file contains the entry point for the Hanabi server software

import (
	"io/ioutil"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/joho/godotenv"
)

var (
	projectPath string
	dataPath    string
	versionPath string
	tablesPath  string

	logger           *Logger
	gitCommitOnStart string
	usingSentry      bool
	models           *Models
	datetimeStarted  time.Time
	tables           = make(map[int]*Table) // Defined in "table.go"
	// For storing all of the random words (used for random table names)
	wordList = make([]string, 0)
)

func main() {
	// Initialize logging (in "logger.go")
	logger = NewLogger()

	// Welcome message
	logger.Info("+-----------------------+")
	logger.Info("| Starting hanabi-live. |")
	logger.Info("+-----------------------+")

	// Get the project path
	// https://stackoverflow.com/questions/18537257/
	if v, err := os.Executable(); err != nil {
		logger.Fatal("Failed to get the path of the currently running executable:", err)
	} else {
		projectPath = filepath.Dir(v)
	}

	// Check to see if the data path exists
	dataPath = path.Join(projectPath, "public", "js", "src", "data")
	if _, err := os.Stat(dataPath); os.IsNotExist(err) {
		logger.Fatal("The data path of \"" + dataPath + "\" does not exist. " +
			"This directory should always exist; please try re-cloning the repository.")
		return
	} else if err != nil {
		logger.Fatal("Failed to check if the \""+dataPath+"\" file exists:", err)
		return
	}

	// Check to see if the version file exists
	// Note that there are two different version files:
	// 1) ./public/js/src/data/version.json
	// 2) ./public/js/bundles/version.json
	// The former is for "baking" the version into the JavaScript client
	// The later is to inform the server about the latest already-compiled client version
	versionPath = path.Join(projectPath, "public", "js", "bundles", "version.json")
	if _, err := os.Stat(versionPath); os.IsNotExist(err) {
		logger.Fatal("The \"" + versionPath + "\" file does not exist. " +
			"Did you run the \"install_dependencies.sh\" script before running the server? " +
			"This file should automatically be created when building the client.")
		return
	} else if err != nil {
		logger.Fatal("Failed to check if the \""+versionPath+"\" file exists:", err)
		return
	}

	// Check to see if the "ongoing-tables" directory exists
	tablesPath = path.Join(projectPath, "ongoing-tables")
	if _, err := os.Stat(tablesPath); os.IsNotExist(err) {
		logger.Error("The directory \"" + tablesPath + "\" does not exist. " +
			"This directory should always exist; please try re-cloning the repository.")
		return
	} else if err != nil {
		logger.Fatal("Failed to check if the \""+tablesPath+"\" file exists:", err)
		return
	}

	// Record the commit that corresponds with when the Golang code was compiled
	// (this is useful to know what version of the server is running,
	// since it is possible to update the client without restarting the server)
	cmd := exec.Command("git", "rev-parse", "HEAD")
	if stdout, err := cmd.Output(); err != nil {
		logger.Fatal("Failed to perform a \"git rev-parse HEAD\":", err)
		return
	} else {
		gitCommitOnStart = string(stdout)
	}

	// Check to see if the ".env" file exists
	envPath := path.Join(projectPath, ".env")
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		logger.Fatal("The \"" + envPath + "\" file does not exist. " +
			"Did you run the \"install_dependencies.sh\" script before running the server? " +
			"This file should automatically be created when running this script.")
		return
	} else if err != nil {
		logger.Fatal("Failed to check if the \""+envPath+"\" file exists:", err)
		return
	}

	// Load the ".env" file which contains environment variables with secret values
	if err := godotenv.Load(envPath); err != nil {
		logger.Fatal("Failed to load the \".env\" file:", err)
		return
	}

	// If we are running in a development environment, change some constants
	if os.Getenv("DOMAIN") == "localhost" || os.Getenv("DOMAIN") == "" {
		idleGameTimeout = idleGameTimeoutDev
	}

	// Initialize Sentry (in "sentry.go")
	usingSentry = sentryInit()
	if usingSentry {
		// Flush buffered events before the program terminates
		// https://github.com/getsentry/sentry-go
		defer sentry.Flush(2 * time.Second)
	}

	// Initialize the database model (in "models.go")
	if v, err := modelsInit(); err != nil {
		logger.Fatal("Failed to open the database:", err)
		return
	} else {
		models = v
	}
	defer models.Close()

	// Validate that the database exists
	if err := models.Metadata.TestDatabase(); err != nil {
		if strings.Contains(err.Error(), "Unknown database") {
			logger.Fatal("The \"" + dbName + "\" database does not exist. " +
				"Please follow the instructions located in the \"docs/INSTALL.md\" file " +
				"in order to set up the database.")
			return
		}

		logger.Error("Failed to run the database test query:", err)
		logger.Fatal("Try re-running the \"install/install_database_schema.sh\" script " +
			"in order to re-initialize the database.")
		return
	}

	colorsInit()   // (in "colors.go")
	suitsInit()    // (in "suits.go")
	variantsInit() // (in "variants.go")

	// Initialize the action functions command map (in "command_action.go")
	actionsFunctionsInit()

	// Initialize "Detrimental Character Assignments" (in "characters.go")
	characterInit()

	// Initialize the word list
	wordListPath := path.Join(projectPath, "src", "assets", "word_list.txt")
	if v, err := ioutil.ReadFile(wordListPath); err != nil {
		logger.Fatal("Failed to read the \""+wordListPath+"\" file:", err)
		return
	} else {
		wordListString := string(v)
		wordList = strings.Split(wordListString, "\n")
	}

	// Start the Discord bot (in "discord.go")
	discordInit()

	// Get the people on the waiting list from the database (in "waitingList.go")
	waitingListInit()

	// Initialize a WebSocket router using the Melody framework (in "websocket.go")
	websocketInit()

	// Initialize chat commands (in "chatCommand.go")
	chatCommandInit()

	// Load the current speedrun records (in "speedrun.go")
	speedrunInit()

	// Record the time that the server started
	datetimeStarted = time.Now()

	// Restore tables that were ongoing at the time of the last server restart
	restoreTables()

	// Initialize an HTTP router that will only listen locally for maintenance-related commands
	// (in "httpLocalhost.go")
	// (the "ListenAndServe" functions located inside here are blocking)
	go httpLocalhostInit()

	// Initialize an HTTP router using the Gin framework (in "http.go")
	// (the "ListenAndServe" functions located inside here are blocking)
	httpInit()
}
