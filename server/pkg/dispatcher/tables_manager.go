package dispatcher

type TablesManager interface {
	New(userID int, data interface{})
	DisconnectUser(userID int)
	GetTables(userID int) []interface{}
	GetUserTables(userID int) ([]uint64, []uint64)
}
