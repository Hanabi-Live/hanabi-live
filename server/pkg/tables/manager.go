package tables

import (
	"regexp"
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/table"
	"github.com/tevino/abool"
)

// Manager is an object that handles adding or removing tables,
// as well as user relationships to tables.
// It listens for requests in a new goroutine.
type Manager struct {
	// We don't need a mutex for the map because only the manager goroutine will access it
	tables           map[uint64]*table.Manager // Indexed by table ID
	usersPlaying     map[int][]uint64          // Indexed by user ID, values are table IDs
	usersSpectating  map[int][]uint64          // Indexed by user ID, values are table IDs
	isValidTableName func(string) bool

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[int]func(interface{})
	requestsClosed    *abool.AtomicBool

	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher
}

func NewManager(logger *logger.Logger, models *models.Models) *Manager {
	m := &Manager{
		tables:           make(map[uint64]*table.Manager),
		usersPlaying:     make(map[int][]uint64),
		usersSpectating:  make(map[int][]uint64),
		isValidTableName: regexp.MustCompile(`^[a-zA-Z0-9 !@#$\(\)\-_=\+;:,\.\?]+$`).MatchString,

		requests:       make(chan *request),
		requestFuncMap: make(map[int]func(interface{})),
		requestsClosed: abool.New(),

		logger:     logger,
		models:     models,
		Dispatcher: nil, // This will be filled in after this object is instantiated
	}
	m.requestFuncMapInit()
	go m.ListenForRequests()

	return m
}
