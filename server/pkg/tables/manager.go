package tables

import (
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/table"
)

// Manager is an object that handles adding or removing tables,
// as well as user relationships to tables
// It listens for requests in a new goroutine
type Manager struct {
	// We don't need a mutex for the map because only the manager goroutine will access it
	tables          map[uint64]*table.Manager // Indexed by table ID
	usersPlaying    map[int][]uint64          // Indexed by user ID, values are table IDs
	usersSpectating map[int][]uint64          // Indexed by user ID, values are table IDs

	requests       chan *request
	requestFuncMap map[int]func(*Manager, interface{})

	logger *logger.Logger
}

func NewManager(logger *logger.Logger) *Manager {
	m := &Manager{
		tables:          make(map[uint64]*table.Manager),
		usersPlaying:    make(map[int][]uint64),
		usersSpectating: make(map[int][]uint64),

		requests:       make(chan *request),
		requestFuncMap: make(map[int]func(*Manager, interface{})),

		logger: logger,
	}
	m.requestFuncMapInit()

	go m.ListenForRequests()

	return m
}
