package dispatcher

type ChatManager interface {
	Chat(
		userID int,
		username string,
		msg string,
		room string,
		discord bool,
		discordDiscriminator string,
		server bool,
	)
	ChatDiscord(username string, msg string, discordDiscriminator string)
	ChatServer(msg string, room string)
}
