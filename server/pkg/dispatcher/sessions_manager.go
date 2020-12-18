package dispatcher

type sessionsManager interface {
	NotifyWarning(userID int, msg string)
	NotifyError(userID int, msg string)
	NotifyAllError(msg string)
}
