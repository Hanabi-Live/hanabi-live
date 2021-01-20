package sessions

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type notifySpectatorsData struct {
	userID     int
	tableID    int
	spectators []*types.SpectatorDescription
}

func (m *Manager) NotifySpectators(
	userID int,
	tableID int,
	spectators []*types.SpectatorDescription,
) {
	m.newRequest(requestTypeNotifySpectators, &notifySpectatorsData{ // nolint: errcheck
		userID:     userID,
		tableID:    tableID,
		spectators: spectators,
	})
}

func (m *Manager) notifySpectators(data interface{}) {
	var d *notifySpectatorsData
	if v, ok := data.(*notifySpectatorsData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type spectatorsData struct {
		TableID    int                           `json:"tableID"`
		Spectators []*types.SpectatorDescription `json:"spectators"`
	}
	m.send(d.userID, "spectators", &spectatorsData{
		TableID:    d.tableID,
		Spectators: d.spectators,
	})
}
