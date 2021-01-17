package dispatcher

type ChatManager interface {
	ChatNormal(userID int, username string, msg string, room string)
	ChatDiscord(username string, msg string, discordDiscriminator string)
	ChatServer(msg string, room string)
}
