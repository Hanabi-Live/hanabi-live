package main

import (
	"database/sql"
	"io/ioutil"
	"os"
	"os/exec"
	"time"

	"github.com/Zamiell/go-logging"
	_ "github.com/go-sql-driver/mysql"
)

// =======================
// logging
// =======================

var logger *logging.Logger = func() (l *logging.Logger) {
	// Initialize logging using the "go-logging" library
	// http://godoc.org/github.com/op/go-logging#Formatter
	l = logging.MustGetLogger("hanabi-live")
	loggingBackend := logging.NewLogBackend(os.Stdout, "", 0)
	logFormat := logging.MustStringFormatter( // https://golang.org/pkg/time/#Time.Format
		`%{time:Mon Jan 02 15:04:05 MST 2006} - %{level:.4s} - %{shortfile} - %{message}`,
	)
	loggingBackendFormatted := logging.NewBackendFormatter(loggingBackend, logFormat)
	logging.SetBackend(loggingBackendFormatted)
	return
}()

// ==========================
// configuration
// ==========================

// location of the environment file to write
var envFileLocation = "/app/.env"

// max number of retries when connecting to the database
var dbConnectRetries = 60

// time to wait between retries
var dbConnectRetryDelay = time.Second

// ==============================
// environment variables
// ==============================

var dbHost = readVariable("DB_HOST", "localhost")
var dbPort = readVariable("DB_PORT", "3306")
var dbUser = readVariable("DB_USER", "hanabiuser")
var dbPass = readVariable("DB_PASS", "12345678")
var dbName = readVariable("DB_NAME", "hanabi")

// readVariable reads a single environment variable
// When the variable is unset, returns fallback.
func readVariable(name string, fallback string) (candidate string) {
	candidate = os.Getenv(name)
	if len(candidate) == 0 {
		logger.Infof("Variable %s is not defined, falling back to %v", name, fallback)
		candidate = fallback
	}
	return
}

// writeOptionalVariable returns a string that can be used in a .env file to represent the variable
func writeOptionalVariable(name string) string {
	variable := os.Getenv(name)
	if len(variable) == 0 {
		return name + "="
	}
	return name + "=\"" + variable + "\""
}

// ==============================
// Main code
// ==============================

func main() {
	// wait for the database
	if err := waitForDatabase(); err != nil {
		os.Exit(1)
	}

	// take the environment variables passed to the docker image and write them into the .env file
	if err := writeEnvFile(); err != nil {
		os.Exit(1)
	}

	// hand control over to the actual server
	logger.Info("Handing control to hanabi-live server ...")
	cmd := exec.Command(os.Args[1], os.Args[2:]...)
	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout
	cmd.Stdin = os.Stdin
	cmd.Start()
	cmd.Wait()
}

// writeEnvFile writes the hanab-live configuration file to disk
// all supported parameters are read from the environment
// other parameters (such as the port) are hard-coded
func writeEnvFile() (err error) {
	envfile := `
` + writeOptionalVariable("DOMAIN") + `
PORT=8080
	
` + writeOptionalVariable("SESSION_SECRET") + `

# variables with some default values
DB_HOST="` + dbHost + `"
DB_PORT=` + dbPort + `
DB_USER="` + dbUser + `"
DB_PASS="` + dbPass + `"
DB_NAME="` + dbName + `"

# for now all the other things are not supported
` + writeOptionalVariable("DISCORD_TOKEN") + `
` + writeOptionalVariable("DISCORD_LISTEN_CHANNEL_IDS") + `
` + writeOptionalVariable("DISCORD_LOBBY_CHANNEL_ID") + `

` + writeOptionalVariable("GA_TRACKING_ID") + `
` + writeOptionalVariable("SENTRY_DSN") + `

# ssl isn't supported at the moment, as it's much easier to just do this in docker with a seperate proxy
TLS_CERT_FILE=
TLS_KEY_FILE=
`
	logger.Info("Writing .env file based on environment variables")

	// and return it
	err = ioutil.WriteFile(envFileLocation, []byte(envfile), 0)
	if err != nil {
		logger.Errorf("Unable to write env file: %s", err.Error())
	}
	return
}

// waitForDatabase repreatedly attempts to connect to the sql server until a connection is established
// will retry the connection dbConnectRetries times, waiting dbConnectRetryDelay between each attempt
func waitForDatabase() (err error) {
	err = connectAndPing()
	for err != nil {
		logger.Infof("Unable to connect to database: %s, %d retries left. ", err.Error(), dbConnectRetries)
		dbConnectRetries--
		if dbConnectRetries == 0 {
			return
		}
		time.Sleep(dbConnectRetryDelay)
		err = connectAndPing()
	}

	logger.Info("Database connection is established")
	return
}

var dsn = dbUser + ":" + dbPass + "@(" + dbHost + ":" + dbPort + ")/" + dbName + "?parseTime=true"

// connectAndPing tries to connect to the database and then ping it.
// Returns nil when the operation succeeds, and an error if not
// Guarantees that any connection with the database is cleaned up
func connectAndPing() (err error) {
	var db *sql.DB
	if db, err = sql.Open("mysql", dsn); err != nil {
		return err
	}
	defer db.Close()

	// ping the databse
	if err = db.Ping(); err != nil {
		return err
	}

	return nil
}
