package table

import "github.com/Zamiell/hanabi-live/server/pkg/constants"

func (m *Manager) TerminateServer() {
	m.newRequest(requestTypeTerminateServer, nil) // nolint: errcheck
}

func (m *Manager) terminateServer(data interface{}) {
	// Local variables
	t := m.table

	// Only terminate ongoing games
	if !t.Running || t.Replay {
		return
	}

	m.action(&actionData{
		userID:     0,
		username:   constants.WebsiteName,
		actionType: constants.ActionTypeEndGame,
		target:     serverPlayerTargetIndex,
		value:      int(constants.EndConditionTerminated),
	})
}
