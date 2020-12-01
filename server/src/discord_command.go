package main

import (
	"strconv"

	"github.com/bwmarrin/discordgo"
)

func discordCommand(m *discordgo.MessageCreate, command string, args []string) {
	// ----------------
	// Special commands
	// ----------------

	if command == "replay" || command == "link" || command == "game" {
		if len(args) == 0 {
			discordSend(
				m.ChannelID,
				"",
				"The format of the /replay command is: /replay [game ID] [turn number]",
			)
			return
		}

		// Validate that the first argument is a number
		arg1 := args[0]
		args = args[1:] // This will be an empty slice if there is nothing after the command
		var id int
		if v, err := strconv.Atoi(arg1); err != nil {
			var msg string
			if _, err := strconv.ParseFloat(arg1, 64); err != nil {
				msg = "\"" + arg1 + "\" is not a number."
			} else {
				msg = "The /replay command only accepts integers."
			}
			discordSend(m.ChannelID, "", msg)
			return
		} else {
			id = v
		}

		if len(args) == 0 {
			// They specified an ID but not a turn
			path := "/replay/" + strconv.Itoa(id)
			url := getURLFromPath(path)
			// We enclose the link in "<>" to prevent Discord from generating a link preview
			msg := "<" + url + ">"
			discordSend(m.ChannelID, "", msg)
			return
		}

		// Validate that the second argument is a number
		arg2 := args[0]
		var turn int
		if v, err := strconv.Atoi(arg2); err != nil {
			var msg string
			if _, err := strconv.ParseFloat(arg2, 64); err != nil {
				msg = "\"" + arg2 + "\" is not a number."
			} else {
				msg = "The /replay command only accepts integers."
			}
			discordSend(m.ChannelID, "", msg)
			return
		} else {
			turn = v
		}

		// They specified an ID and a turn
		path := "/replay/" + strconv.Itoa(id) + "#" + strconv.Itoa(turn)
		url := getURLFromPath(path)
		// We enclose the link in "<>" to prevent Discord from generating a link preview
		msg := "<" + url + ">"
		discordSend(m.ChannelID, "", msg)
		return
	}

	// -------------
	// Info commands
	// -------------

	if command == "2pquestion" || command == "2player" || command == "2p" {
		// This includes a discord link to the #2-player channel
		msg := "Ask questions about 2-player games in the <#712153960709881888> channel."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "badquestion" {
		msg := "Your question is not specific enough. In order to properly answer it, we need to know the amount of players in the game, all of the cards in all of the hands, the amount of current clues, and so forth. Please type out a full Alice and Bob story in the style of the reference document. (e.g. <https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#the-reverse-finesse>)"
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "bga" {
		msg := "If you have experience playing with the Board Game Arena convention framework and you are interested in learning the Hyphen-ated group convention framework, then read this: <https://github.com/Zamiell/hanabi-conventions/blob/master/misc/BGA.md>"
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "level" {
		msg := "When asking questions in the #convention-questions channel, please remember to include the convention level that the current players of the game are playing with."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "loweffort" {
		msg := "It looks like you are asking a low-effort question. Update your question to explain what **you** think the best answer is, based on your current understanding of the conventions. Provide a detailed explanation as to **why** you think it is the best answer. Discuss any relevant contextual clues present in the game that influence the answer, if any. Provide an alternate answer that might also be the case and discuss why that answer is not as good. This allows us to hone in on the specific gaps in your knowledge."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "notation" {
		msg := "It looks like you are using non-standard card notation in your question. Please use notation that the Hyphen-ated group will be familiar with. For example:\n- Use \"red 3\" instead of \"3 red\".\n- Use \"r3\" instead of \"3r\".\n- Use \"r[3]\" to indicate that a card is a red 3 but has a number 3 clue on it.\n- Always use the characters of Alice, Bob, Cathy, Donald, Emily, and Frank instead of real player names. Alice should always be the player who performs the first action, and so forth."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "oop" {
		msg := "It looks like you are asking a question about an *Out-of-Position Bluff* (or OOP for short). When asking such questions, **you must include** the condition that you think is satisfied (i, ii, or iii)."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "screenshot" || command == "noreplay" {
		msg := "It looks like you have posted a screenshot of a game state. When asking questions in the #convention-questions channel, please **do not post a screenshot** and instead use the `/replay` command to generate a link to the specific turn of the game in question."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "undefined" {
		msg := "**Why isn't [situation X] defined in the conventions document?**\n\n"
		msg += "Not everything has to have a meaning. We intentionally want to have some situations be undefined so that we have some wiggle room to handle a wide variety of game states: <https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Convention_Goals.md>"
		discordSend(m.ChannelID, "", msg)
		return
	}
}
