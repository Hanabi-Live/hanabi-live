package main // In Go, executable commands must always use package main

// This file contains the entry point for the Hanabi server software

import (
	"io/ioutil"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
	logging "github.com/op/go-logging"
)

var (
	projectPath string
	dataPath    string
	versionPath string

	logger *logging.Logger
	models *Models
	domain string
	tables = make(map[int]*Table) // Defined in "table.go"
	// For storing all of the random words (used for random table names)
	wordList = make([]string, 0)
	// For storing the players who are waiting for the next game to start
	waitingList = make([]*Waiter, 0)
	// If true, the server will restart after all games are finished
	shuttingDown = false
)

func main() {
	// Initialize logging
	// http://godoc.org/github.com/op/go-logging#Formatter
	logger = logging.MustGetLogger("hanabi-live")
	loggingBackend := logging.NewLogBackend(os.Stdout, "", 0)
	logFormat := logging.MustStringFormatter( // https://golang.org/pkg/time/#Time.Format
		`%{time:Mon Jan 02 15:04:05 MST 2006} - %{level:.4s} - %{shortfile} - %{message}`,
	)
	loggingBackendFormatted := logging.NewBackendFormatter(loggingBackend, logFormat)
	logging.SetBackend(loggingBackendFormatted)

	// Welcome message
	logger.Info("+-----------------------+")
	logger.Info("| Starting hanabi-live. |")
	logger.Info("+-----------------------+")

	// Get the project path
	// https://stackoverflow.com/questions/18537257/how-to-get-the-directory-of-the-currently-running-file
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
	}

	// Check to see if the version file exists
	versionPath = path.Join(dataPath, "version.json")
	if _, err := os.Stat(versionPath); os.IsNotExist(err) {
		logger.Fatal("The \"" + versionPath + "\" file does not exist. " +
			"Did you run the \"install_dependencies.sh\" script before running the server? " +
			"This file should automatically be created when building the client.")
		return
	}

	// Check to see if the ".env" file exists
	envPath := path.Join(projectPath, ".env")
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		logger.Fatal("The \"" + envPath + "\" file does not exist. " +
			"Did you run the \"install_dependencies.sh\" script before running the server? " +
			"This file should automatically be created when running this script.")
		return
	}

	// Load the ".env" file which contains environment variables with secret values
	if err := godotenv.Load(envPath); err != nil {
		logger.Fatal("Failed to load the \".env\" file:", err)
		return
	}

	// If we are running in a development environment, change some constants
	if os.Getenv("DOMAIN") == "localhost" {
		idleGameTimeout = idleGameTimeoutDev
	}

	// Initialize the database model
	if v, err := modelsInit(); err != nil {
		logger.Fatal("Failed to open the database:", err)
		return
	} else {
		models = v
	}
	defer models.Close()

	// Validate that the database exists
	if err := models.DiscordMetadata.TestDatabase(); err != nil {
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

	// Initialize the variants
	colorsInit()
	suitsInit()
	variantsInit()

	// Initialize "Detrimental Character Assignments"
	characterInit()

	// Initialize the word list
	wordListPath := path.Join(projectPath, "src", "assets", "wordList.txt")
	if v, err := ioutil.ReadFile(wordListPath); err != nil {
		logger.Fatal("Failed to read the \""+wordListPath+"\" file:", err)
		return
	} else {
		wordListString := string(v)
		wordList = strings.Split(wordListString, "\n")
	}

	// Initialize catching Unix signals
	go signalInit()

	// Start the Discord bot (in "discord.go")
	discordInit()

	// Get the people on the waiting list from the database
	waitingListInit()

	// Initialize a WebSocket router using the Melody framework (in "websocket.go")
	websocketInit()

	// Initialize chat commands
	chatCommandInit()

	// Load the current speedrun records
	speedrunInit()

	// Initialize an HTTP router using the Gin framework (in "http.go")
	// (the "ListenAndServe" functions located inside here are blocking)
	httpInit()
}
