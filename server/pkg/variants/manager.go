package variants

import (
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
)

type Manager struct {
	colors          map[string]*Color
	suits           map[string]*Suit
	variantsNameMap map[string]*Variant
	variantsIDMap   map[int]*Variant
	variantNames    []string
	noVariant       *Variant

	logger *logger.Logger
}

func NewManager(logger *logger.Logger, dataPath string) *Manager {
	m := &Manager{
		colors:          make(map[string]*Color),
		suits:           make(map[string]*Suit),
		variantsNameMap: make(map[string]*Variant),
		variantsIDMap:   make(map[int]*Variant),
		variantNames:    make([]string, 0),
		noVariant:       nil, // Set in "manager.VariantsInit()"

		logger: logger,
	}

	m.ColorsInit(dataPath)
	m.SuitsInit(dataPath)
	m.VariantsInit(dataPath)

	return m
}
