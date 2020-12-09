package sessions

import (
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
)

// Manager is an object that handles reading, writing, and organizing all of the WebSocket sessions,
// using the "nhooyr.io/websocket" library
// It listens for requests in a new goroutine
type Manager struct {
	// We don't need a mutex for the map because only the manager goroutine will access it
	sessions map[int]*session

	requests       chan *request
	requestFuncMap map[int]func(*Manager, interface{})

	logger *logger.Logger
	models *models.Models
}

func NewManager(logger *logger.Logger, models *models.Models) *Manager {
	m := &Manager{
		sessions: make(map[int]*session),

		requests:       make(chan *request),
		requestFuncMap: make(map[int]func(*Manager, interface{})),

		logger: logger,
		models: models,
	}
	m.requestFuncMapInit()

	go m.ListenForRequests()

	return m
}
