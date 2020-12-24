package dispatcher

type DiscordManager interface {
	ChatFill(msg string) string
	GetNickname(discordID string) string
	LobbySync(username string, msg string)
}
