package tables

import (
	"github.com/Zamiell/hanabi-live/server/pkg/table"
)

type getTableData struct {
	tableID        int
	resultsChannel chan *table.Manager
}

// GetTable requests a table manager. If the specified table does it exist, it returns nil.
func (m *Manager) GetTable(tableID int) *table.Manager {
	resultsChannel := make(chan *table.Manager)

	if err := m.newRequest(requestTypeGetTable, &getTableData{
		tableID:        tableID,
		resultsChannel: resultsChannel,
	}); err != nil {
		return nil
	}

	return <-resultsChannel
}

func (m *Manager) getTable(data interface{}) interface{} {
	var d *getTableData
	if v, ok := data.(*getTableData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	t, ok := m.tables[d.tableID]
	if !ok {
		d.resultsChannel <- nil
		return false
	}

	d.resultsChannel <- t
	return true
}
