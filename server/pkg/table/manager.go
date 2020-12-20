package table

import (
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/tevino/abool"
)

// Manager is an object that handles management of a single table.
// It listens for requests in a new goroutine.
type Manager struct {
	table *table

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[int]func(interface{})
	requestsClosed    *abool.AtomicBool

	logger *logger.Logger
}

func NewManager(logger *logger.Logger, d *NewTableData) *Manager {
	m := &Manager{
		table: nil,

		requests:       make(chan *request),
		requestFuncMap: make(map[int]func(interface{})),
		requestsClosed: abool.New(),

		logger: logger,
	}
	m.requestFuncMapInit()
	go m.ListenForRequests()

	m.table = newTable(d)

	return m
}
