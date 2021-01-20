package commands

import (
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/tevino/abool"
)

// Manager is an object that handles dealing with incoming commands from end-users.
// In this case, "commands" refers to WebSocket messages (e.g. requests to join a table, making a
// move in an ongoing game, and so forth).
// Manager listens for requests in a new goroutine.
type Manager struct {
	name string

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[string]func(*SessionData, []byte)
	requestsClosed    *abool.AtomicBool

	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher
}

type SessionData struct {
	UserID   int
	Username string
	Friends  map[int]struct{}
	Muted    bool
}

func NewManager(logger *logger.Logger, models *models.Models) *Manager {
	m := &Manager{
		name: "commands",

		requests:       make(chan *request),
		requestFuncMap: make(map[string]func(*SessionData, []byte)),
		requestsClosed: abool.New(),

		logger:     logger,
		models:     models,
		Dispatcher: nil, // This will be filled in after this object is instantiated
	}
	m.requestFuncMapInit()
	go m.ListenForRequests()

	return m
}
