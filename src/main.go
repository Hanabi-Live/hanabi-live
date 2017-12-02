package main // In Go, executable commands must always use package main

import (
	"os"
	"path"

	"github.com/Zamiell/hanabi-live/src/models"
	"github.com/joho/godotenv"
	logging "github.com/op/go-logging"
)

var (
	projectPath = path.Join(os.Getenv("GOPATH"), "src", "github.com", "Zamiell", "hanabi-live")
	log         *logging.Logger
	db          *models.Models
	games       = make(map[int]*Game) // In "dataTypes.go"
)

func main() {
	// Initialize logging
	// http://godoc.org/github.com/op/go-logging#Formatter
	log = logging.MustGetLogger("hanabi-live")
	loggingBackend := logging.NewLogBackend(os.Stdout, "", 0)
	logFormat := logging.MustStringFormatter( // https://golang.org/pkg/time/#Time.Format
		`%{time:Mon Jan 2 15:04:05 MST 2006} - %{level:.4s} - %{shortfile} - %{message}`,
	)
	loggingBackendFormatted := logging.NewBackendFormatter(loggingBackend, logFormat)
	logging.SetBackend(loggingBackendFormatted)

	// Welcome message
	log.Info("+----------------------+")
	log.Info("| Starting hanab-live. |")
	log.Info("+----------------------+")

	// Load the ".env" file which contains environment variables with secret values
	if err := godotenv.Load(path.Join(projectPath, ".env")); err != nil {
		log.Fatal("Failed to load .env file:", err)
	}

	// Initialize the database model
	if v, err := models.Init(); err != nil {
		log.Fatal("Failed to open the database:", err)
	} else {
		db = v
	}
	defer db.Close()

	// Start the Discord bot (in discord.go)
	//discordInit()

	// Start the Keldon bot (in keldon.go)
	//keldonInit()

	// Initialize a WebSocket router using the Melody framework
	// (in websocket.go)
	websocketInit()

	// Initialize an HTTP router using the Gin framework (in http.go)
	// (the "ListenAndServe" functions located inside here are blocking)
	httpInit()
}
