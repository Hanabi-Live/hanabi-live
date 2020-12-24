package dispatcher

type ChatManager interface {
	Chat(
		userID int,
		username string,
		msg string,
		room string,
		discord bool,
		discordDiscriminator string,
		onlyDiscord bool,
		server bool,
	)
}
