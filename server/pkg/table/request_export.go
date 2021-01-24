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

	if err := m.newRequest(requestTypeExport, &exportData{
		seed:           seed,
		resultsChannel: resultsChannel,
	}); err != nil {
		return make([]*options.CardIdentity, 0)
	}

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
		table: t,
		Seed:  d.seed,
	}

	g.initDeck()
	util.SetSeedFromString(g.Seed) // Seed the random number generator
	g.shuffleDeck()

	d.resultsChannel <- g.CardIdentities
}
