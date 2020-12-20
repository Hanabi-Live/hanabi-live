package dispatcher

type SessionsManager interface {
	New(data interface{}) error

	NotifyWarning(userID int, msg string)
	NotifyError(userID int, msg string)
	NotifyAllError(msg string)
}
