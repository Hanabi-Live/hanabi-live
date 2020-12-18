package dispatcher

type commandsManager interface {
	Send(userID int, command string, data interface{})
}
