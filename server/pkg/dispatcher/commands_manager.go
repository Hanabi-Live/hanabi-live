package dispatcher

type CommandsManager interface {
	Send(userID int, command string, data interface{})
}
