package table

import (
	"fmt"
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/tevino/abool"
)

// Manager is an object that handles management of a single table.
// It listens for requests in a new goroutine.
type Manager struct {
	name  string
	table *table

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[requestType]func(interface{})
	requestsClosed    *abool.AtomicBool

	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher
}

func NewManager(
	logger *logger.Logger,
	models *models.Models,
	dispatcher *dispatcher.Dispatcher,
	d *NewTableData,
) *Manager {
	m := &Manager{
		name:  fmt.Sprintf("table %v", d.ID),
		table: nil,

		requests:       make(chan *request),
		requestFuncMap: make(map[requestType]func(interface{})),
		requestsClosed: abool.New(),

		logger:     logger,
		models:     models,
		Dispatcher: dispatcher,
	}
	m.requestFuncMapInit()
	go m.ListenForRequests()

	m.table = newTable(d)
	m.table.manager = m

	return m
}
