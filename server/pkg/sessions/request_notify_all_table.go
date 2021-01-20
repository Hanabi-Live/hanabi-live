package sessions

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type notifyAllTableData struct {
	tableDescription *types.TableDescription
}

func (m *Manager) NotifyAllTable(tableDescription *types.TableDescription) {
	m.newRequest(requestTypeNotifyAllTable, &notifyAllTableData{ // nolint: errcheck
		tableDescription: tableDescription,
	})
}

func (m *Manager) notifyAllTable(data interface{}) {
	var d *notifyAllTableData
	if v, ok := data.(*notifyAllTableData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.sendAll("table", d.tableDescription)
}
