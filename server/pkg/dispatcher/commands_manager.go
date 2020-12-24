package dispatcher

type CommandsManager interface {
	Send(sessionData interface{}, commandName string, commandData []byte)
}
