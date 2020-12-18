package table

type getDescriptionData struct {
	userID         int
	resultsChannel chan *Description
}

// GetDescription gets a high-level description of a table for use in showing a table row in the
// lobby.
func (m *Manager) GetDescription(userID int) *Description {
	resultsChannel := make(chan *Description)

	m.requests <- &request{
		Type: requestTypeGetDescription,
		Data: &getDescriptionData{
			userID:         userID,
			resultsChannel: resultsChannel,
		},
	}

	return <-resultsChannel
}

func (m *Manager) getDescription(data interface{}) {
	var d *getDescriptionData
	if v, ok := data.(*getDescriptionData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	d.resultsChannel <- makeDescription(m.table, d.userID)
}
