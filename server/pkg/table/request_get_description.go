package table

type getDescriptionData struct {
	userID         int
	resultsChannel chan *Description
}

// GetDescription gets a high-level description of a table for use in showing a table row in the
// lobby.
func (m *Manager) GetDescription(userID int) (*Description, error) {
	resultsChannel := make(chan *Description)

	if err := m.newRequest(requestTypeGetDescription, &getDescriptionData{
		userID:         userID,
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

	d.resultsChannel <- makeDescription(m.table, d.userID)
}
