package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type exportData struct {
	seed           string
	resultsChannel chan []*options.CardIdentity
}

// Export is used to generate the card ordering for a particular seed.
// The game created in this function is meant to be ephemeral and immediately discarded after the
// deck is generated.
func (m *Manager) Export(seed string) []*options.CardIdentity {
	resultsChannel := make(chan []*options.CardIdentity)

	m.newRequest(requestTypeExport, &exportData{ // nolint: errcheck
		seed:           seed,
		resultsChannel: resultsChannel,
	})

	return <-resultsChannel
}

func (m *Manager) export(data interface{}) {
	var d *exportData
	if v, ok := data.(*exportData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table

	g := &game{ // nolint: exhaustivestruct
		options:      t.Options,
		extraOptions: t.ExtraOptions,
		Seed:         d.seed,
	}

	if err := g.initDeck(); err != nil {
		m.logger.Errorf("Failed to initialize the deck: %T", err)
		d.resultsChannel <- g.CardIdentities
		return
	}

	util.SetSeedFromString(g.Seed) // Seed the random number generator
	g.shuffleDeck()

	d.resultsChannel <- g.CardIdentities
}
