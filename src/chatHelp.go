package main

// /help
func chatHelp(s *Session, d *CommandData, t *Table) {
	if d.Discord {
		msg := "General commands (that work everywhere):\n"
		msg += "```\n"
		msg += "Command               Description\n"
		msg += "-----------------------------------------------------------------------------\n"
		msg += "/help                 Display this message\n"
		msg += "/discord              Get the link for the Discord server\n"
		msg += "/random [min] [max]   Get a random number\n"
		msg += "```\n"

		msg += "Lobby/Discord commands:\n"
		msg += "```\n"
		msg += "Command               Description\n"
		msg += "-----------------------------------------------------------------------------\n"
		msg += "/here                 Ping members of the Hyphen-ated group to get a game going\n"
		msg += "/last                 See how long it has been since the last ping\n"
		msg += "/next                 Put yourself on the waiting list\n"
		msg += "/unnext               Take yourself off the waiting list\n"
		msg += "/list                 Show the people on the waiting list\n"
		msg += "```\n"

		msg += "Game commands:\n"
		msg += "```\n"
		msg += "Command               Description\n"
		msg += "-----------------------------------------------------------------------------\n"
		msg += "/s                    Automatically start the game when the next person joins\n"
		msg += "/s#                   Automatically start the game when it has # players\n"
		msg += "/startin [minutes]    Automatically start the game in N minutes\n"
		msg += "/pause                Pause the game (can be done on any turn)\n"
		msg += "/unpause              Unpause the game\n"
		msg += "```\n"

		msg += "Discord-only commands:\n"
		msg += "/link [id] [turn]     Link to a specific game and turn\n"
		msg += "```\n"

		msg += "Admin-only commands (from the lobby only):\n"
		msg += "```\n"
		msg += "Command               Description\n"
		msg += "----------------------------------------------------------------------------\n"
		msg += "/restart              Restart the server\n"
		msg += "/graceful             Gracefully restart the server\n"
		msg += "/shutdown             Gracefully shutdown the server\n"
		msg += "/maintenance          Disable new game creation\n"
		msg += "/cancel               Enable new game creation\n"
		msg += "/debug                Print out some server-side info\n"
		msg += "```"
		discordSend(discordLobbyChannel, "", msg)
	} else {
		msg := "You can see the full list of commands here: "
		msg += "https://github.com/Zamiell/hanabi-live/blob/master/src/chatHelp.go"
		chatServerSend(msg, d.Room)
	}
}
