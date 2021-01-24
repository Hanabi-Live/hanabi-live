package table

import (
	"fmt"
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
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
	shutdownMutex     sync.Mutex

	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher

	actionFuncMap map[constants.ActionType]func(*actionData) bool
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

		requests:          make(chan *request),
		requestsWaitGroup: sync.WaitGroup{},
		requestFuncMap:    make(map[requestType]func(interface{})),
		requestsClosed:    abool.New(),
		shutdownMutex:     sync.Mutex{},

		logger:     logger,
		models:     models,
		Dispatcher: dispatcher,

		actionFuncMap: make(map[constants.ActionType]func(*actionData) bool),
	}
	m.requestFuncMapInit()
	m.actionFuncMapInit()
	go m.listenForRequests()

	t := newTable(d)

	// Glue the two objects together
	m.table = t
	t.manager = m

	// Disable idle timeouts in development
	if !m.Dispatcher.Core.IsDev() {
		go t.idleDetector()
	}

	return m
}
