package dispatcher

type DiscordManager interface {
	ChatFill(msg string) string
	LobbySync(username string, msg string)
}
