package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/options"
)

type TablesManager interface {
	New(
		userID int,
		username string,
		name string,
		options *options.Options,
		password string,
		gameJSON interface{},
		hidePregame bool,
	)
	Delete(tableID int)
	DisconnectUser(userID int, username string)
	GetTable(tableID int) TableManager
	GetTables() []interface{}
	GetUserTables(userID int) ([]uint64, []uint64)
	Join(userID int, username string, tableID int, password string)
	Leave(userID int, username string, tableID int)
	Unattend(userID int, username string, tableID int)
	Unspectate(userID int, username string, tableID int)
}
