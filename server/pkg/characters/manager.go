package characters

import (
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type Manager struct {
	logger *logger.Logger

	charactersNameMap map[string]*types.Character
	charactersIDMap   map[int]*types.Character
	characterNames    []string
}

func NewManager(logger *logger.Logger, dataPath string) *Manager {
	m := &Manager{
		logger: logger,

		charactersNameMap: make(map[string]*types.Character),
		charactersIDMap:   make(map[int]*types.Character),
		characterNames:    make([]string, 0),
	}
	m.charactersInit(dataPath)

	return m
}
