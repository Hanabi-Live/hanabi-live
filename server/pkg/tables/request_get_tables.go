package tables

import "github.com/Zamiell/hanabi-live/server/pkg/types"

type getTablesData struct {
	resultsChannel chan []*types.TableDescription
}

// GetTables requests a list of all of the public tables.
func (m *Manager) GetTables() []*types.TableDescription {
	resultsChannel := make(chan []*types.TableDescription)

	if err := m.newRequest(requestTypeGetTables, &getTablesData{
		resultsChannel: resultsChannel,
	}); err != nil {
		return make([]*types.TableDescription, 0)
	}

	return <-resultsChannel
}

func (m *Manager) getTables(data interface{}) interface{} {
	var d *getTablesData
	if v, ok := data.(*getTablesData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	tables := make([]*types.TableDescription, 0)
	for _, t := range m.tables {
		if tableDescription, err := t.GetDescription(); err != nil {
			// This table has stopped listening to requests, so skip it
		} else if tableDescription.Visible {
			// Skip non-visible tables
			tables = append(tables, tableDescription)
		}
	}

	d.resultsChannel <- tables

	return true
}
