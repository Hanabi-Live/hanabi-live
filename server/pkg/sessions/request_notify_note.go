package sessions

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type notifyNoteData struct {
	userID  int
	tableID int
	order   int
	notes   []*types.Note
}

func (m *Manager) NotifyNote(userID int, tableID int, order int, notes []*types.Note) {
	m.newRequest(requestTypeNotifyNote, &notifyNoteData{ // nolint: errcheck
		userID:  userID,
		tableID: tableID,
		order:   order,
		notes:   notes,
	})
}

func (m *Manager) notifyNote(data interface{}) {
	var d *notifyNoteData
	if v, ok := data.(*notifyNoteData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type noteData struct {
		TableID int `json:"tableID"`
		// The order of the card in the deck that these notes correspond to
		Order int           `json:"order"`
		Notes []*types.Note `json:"notes"`
	}
	m.send(d.userID, "note", &noteData{
		TableID: d.tableID,
		Order:   d.order,
		Notes:   d.notes,
	})
}
