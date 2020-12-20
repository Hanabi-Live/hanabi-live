package dispatcher

type DiscordManager interface {
	GetNickname(discordID string) string
}
