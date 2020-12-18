package dispatcher

type tablesManager interface {
	DisconnectUser(userID int)
	GetTables(userID int) []interface{}
}
