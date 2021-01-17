package chat

import (
	"regexp"
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/tevino/abool"
)

// Manager is an object that handles dealing with chat, whether it be directed at the lobby or an
// individual table.
// Manager listens for requests in a new goroutine.
type Manager struct {
	name string

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[requestType]func(interface{})
	requestsClosed    *abool.AtomicBool
	commandMap        map[string]func(*commandData, dispatcher.TableManager)
	lobbyRoomRegExp   *regexp.Regexp

	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher

	domain string
	useTLS bool
}

func NewManager(logger *logger.Logger, models *models.Models, domain string, useTLS bool) *Manager {
	m := &Manager{
		name: "chat",

		requests:        make(chan *request),
		requestFuncMap:  make(map[requestType]func(interface{})),
		requestsClosed:  abool.New(),
		commandMap:      make(map[string]func(*commandData, dispatcher.TableManager)),
		lobbyRoomRegExp: regexp.MustCompile(`table(\d+)`),

		logger:     logger,
		models:     models,
		Dispatcher: nil, // This will be filled in after this object is instantiated

		domain: domain,
		useTLS: useTLS,
	}
	m.requestFuncMapInit()
	m.commandMapInit()
	go m.ListenForRequests()

	return m
}
