package tables

import (
	"github.com/Zamiell/hanabi-live/server/pkg/table"
)

type getTablesData struct {
	resultsChannel chan []*table.Description
}

// GetTables requests a list of all of the public tables.
func (m *Manager) GetTables() []*table.Description {
	resultsChannel := make(chan []*table.Description)

	if err := m.newRequest(requestTypeGetTables, &getTablesData{
		resultsChannel: resultsChannel,
	}); err != nil {
		return make([]*table.Description, 0)
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

	tables := make([]*table.Description, 0)
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
