package dispatcher

type ChatManager interface {
	ChatNormal(userID int, username string, msg string, room string)
	ChatDiscord(username string, msg string, discordDiscriminator string)
	ChatPM(userID int, username string, msg string, recipient string)
	ChatServer(msg string, room string)
	Friend(userID int, username string, friends map[int]struct{}, targetUsername string, add bool)
	Shutdown()
}
