package dispatcher

type TableManager interface {
	AutomaticStart(userID int, numPlayers int)
	Chat(userID int, username string, msg string, server bool)
	FindVariant()
	Impostor(userID int)
	Kick(userID int, targetUsername string)
	MissingScores()
	Pause(userID int, setting string)
	StartIn(userID int, minutesToWait float64)
	Suggest(turn int)
	Tags()
}
