package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type getDescriptionData struct {
	resultsChannel chan *types.TableDescription
}

// GetDescription gets a high-level description of a table for use in showing a table row in the
// lobby.
func (m *Manager) GetDescription() (*types.TableDescription, error) {
	resultsChannel := make(chan *types.TableDescription)

	if err := m.newRequest(requestTypeGetDescription, &getDescriptionData{
		resultsChannel: resultsChannel,
	}); err != nil {
		return nil, err
	}

	result := <-resultsChannel
	return result, nil
}

func (m *Manager) getDescription(data interface{}) {
	var d *getDescriptionData
	if v, ok := data.(*getDescriptionData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	d.resultsChannel <- newDescription(m.table)
}
