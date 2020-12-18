package tables

import (
	"github.com/Zamiell/hanabi-live/server/pkg/table"
)

type getTablesData struct {
	userID         int
	resultsChannel chan []*table.Description
}

// GetTables requests a list of all of the public tables.
func (m *Manager) GetTables(userID int) []*table.Description {
	resultsChannel := make(chan []*table.Description)

	m.requests <- &request{
		Type: requestTypeGetTables,
		Data: &getTablesData{
			userID:         userID,
			resultsChannel: resultsChannel,
		},
	}

	return <-resultsChannel
}

func (m *Manager) getTables(data interface{}) {
	var d *getTablesData
	if v, ok := data.(*getTablesData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	tables := make([]*table.Description, 0)
	for _, t := range m.tables {
		tableData := t.GetDescription(d.userID)
		tables = append(tables, tableData)
	}

	d.resultsChannel <- tables
}
