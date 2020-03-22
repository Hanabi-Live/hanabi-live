package main

import (
	"strconv"
)

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
		msg += "https://github.com/Zamiell/hanabi-live/blob/master/src/chatGeneral.go"
		chatServerSend(msg, d.Room)
	}
}

// /discord
func chatDiscord(s *Session, d *CommandData, t *Table) {
	msg := "Join the Hanabi Discord server: https://discord.gg/FADvkJp"
	chatServerSend(msg, d.Room)
}

// /random [min] [max]
func chatRandom(s *Session, d *CommandData, t *Table) {
	errorMsg := "That is not a correct usage of the /random command."

	// We expect something like "/random 2" or "/random 1 2"
	if len(d.Args) != 1 && len(d.Args) != 2 {
		chatServerSend(errorMsg, d.Room)
		return
	}

	// Ensure that both arguments are numbers
	var arg1, arg2 int
	if v, err := strconv.Atoi(d.Args[0]); err != nil {
		chatServerSend(errorMsg, d.Room)
		return
	} else {
		arg1 = v
	}
	if len(d.Args) == 2 {
		if v, err := strconv.Atoi(d.Args[1]); err != nil {
			chatServerSend(errorMsg, d.Room)
			return
		} else {
			arg2 = v
		}
	}

	// Assign min and max, depending on how many arguments were passed
	var min, max int
	if len(d.Args) == 1 {
		min = 1
		max = arg1
	} else if len(d.Args) == 2 {
		min = arg1
		max = arg2
	}

	// Do a sanity check
	if max-min <= 0 {
		chatServerSend(errorMsg, d.Room)
		return
	}

	randNum := getRandom(min, max)
	msg := "Random number between " + strconv.Itoa(min) + " and " + strconv.Itoa(max) + ": " + strconv.Itoa(randNum)
	chatServerSend(msg, d.Room)
}

// /debug
func chatDebug(s *Session, d *CommandData, t *Table) {
	if !isAdmin(s, d) {
		return
	}

	debug()
}
