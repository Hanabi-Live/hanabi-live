package sessions

import (
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/tevino/abool"
)

// Manager is an object that handles reading, writing, and organizing all of the WebSocket sessions,
// using the "nhooyr.io/websocket" library.
// It listens for requests in a new goroutine.
type Manager struct {
	name string

	sessions map[int]*session

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[requestType]func(interface{})
	requestsClosed    *abool.AtomicBool

	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher

	projectPath string
}

func NewManager(logger *logger.Logger, models *models.Models, projectPath string) *Manager {
	m := &Manager{
		name: "sessions",

		sessions: make(map[int]*session),

		requests:       make(chan *request),
		requestFuncMap: make(map[requestType]func(interface{})),
		requestsClosed: abool.New(),

		logger:     logger,
		models:     models,
		Dispatcher: nil, // This will be filled in after this object is instantiated

		projectPath: projectPath,
	}
	m.requestFuncMapInit()
	go m.ListenForRequests()

	return m
}
