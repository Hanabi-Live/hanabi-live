package characters

import (
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
)

type Manager struct {
	charactersNameMap map[string]*Character
	charactersIDMap   map[int]*Character
	characterNames    []string

	logger *logger.Logger
}

func NewManager(logger *logger.Logger, dataPath string) *Manager {
	m := &Manager{
		charactersNameMap: make(map[string]*Character),
		charactersIDMap:   make(map[int]*Character),
		characterNames:    make([]string, 0),

		logger: logger,
	}
	m.charactersInit(dataPath)

	return m
}
