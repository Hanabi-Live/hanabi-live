package models

type DiscordMetadata struct{}

func (*DiscordMetadata) Get(name string) (string, error) {
	var value string
	if err := db.QueryRow(`
		SELECT value
		FROM discord_metadata
		WHERE name = ?
	`, name).Scan(&value); err != nil {
		return "", err
	}

	return value, nil
}
