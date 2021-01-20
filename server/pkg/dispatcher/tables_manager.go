package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type TablesManager interface {
	NewTable(
		userID int,
		username string,
		name string,
		options *options.Options,
		password string,
		gameJSON *types.GameJSON,
		hidePregame bool,
	)
	Delete(tableID int)
	DisconnectUser(userID int, username string)
	GetTable(tableID int) TableManager
	GetTables() []*types.TableDescription
	GetUserTables(userID int) ([]uint64, []uint64)
	Join(userID int, username string, tableID int, password string)
	Leave(userID int, username string, tableID int)
	Unattend(userID int, username string, tableID int)
	Unspectate(userID int, username string, tableID int)
}
