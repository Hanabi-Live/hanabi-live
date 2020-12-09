package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
)

// Manager is an object that handles management of a single table
// It listens for requests in a new goroutine
type Manager struct {
	table *Table

	requests       chan *request
	requestFuncMap map[int]func(*Manager, interface{})

	logger *logger.Logger
}

const (
	RequestTypeFoo = iota
	RequestTypeBar
)

func NewManager(t *Table, logger *logger.Logger) *Manager {
	m := &Manager{
		table: t,

		requests:       make(chan *request),
		requestFuncMap: make(map[int]func(*Manager, interface{})),

		logger: logger,
	}
	m.requestFuncMapInit()

	go m.ListenForRequests()

	return m
}
