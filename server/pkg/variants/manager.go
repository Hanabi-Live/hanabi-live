package variants

import (
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
)

type Manager struct {
	Colors        map[string]*Color
	Suits         map[string]*Suit
	Variants      map[string]*Variant
	VariantsIDMap map[int]*Variant
	VariantNames  []string
	NoVariant     *Variant

	logger *logger.Logger
}

func NewManager(logger *logger.Logger, dataPath string) *Manager {
	m := &Manager{
		Colors:        make(map[string]*Color),
		Suits:         make(map[string]*Suit),
		Variants:      make(map[string]*Variant),
		VariantsIDMap: make(map[int]*Variant),
		VariantNames:  make([]string, 0),
		NoVariant:     nil, // Set in "manager.VariantsInit()"

		logger: logger,
	}

	m.ColorsInit(dataPath)
	m.SuitsInit(dataPath)
	m.VariantsInit(dataPath)

	return m
}
