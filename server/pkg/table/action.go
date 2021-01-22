package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

func (m *Manager) actionFuncMapInit() {
	m.actionFuncMap[constants.ActionTypePlay] = actionPlay
	m.actionFuncMap[constants.ActionTypeDiscard] = actionDiscard
	m.actionFuncMap[constants.ActionTypeColorClue] = actionClue
	m.actionFuncMap[constants.ActionTypeRankClue] = actionClue
	m.actionFuncMap[constants.ActionTypeEndGame] = actionEndGame
}
