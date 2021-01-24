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

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[requestType]func(interface{})
	requestsClosed    *abool.AtomicBool
	shutdownMutex     sync.Mutex

	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher

	sessions    map[int]*session
	projectPath string
}

func NewManager(logger *logger.Logger, models *models.Models, projectPath string) *Manager {
	m := &Manager{
		name: "sessions",

		requests:       make(chan *request),
		requestFuncMap: make(map[requestType]func(interface{})),
		requestsClosed: abool.New(),
		shutdownMutex:  sync.Mutex{},

		logger:     logger,
		models:     models,
		Dispatcher: nil, // This will be filled in after this object is instantiated

		sessions:    make(map[int]*session),
		projectPath: projectPath,
	}
	m.requestFuncMapInit()
	go m.listenForRequests()

	return m
}
