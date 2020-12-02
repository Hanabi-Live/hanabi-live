package main

import (
	"strconv"

	"github.com/bwmarrin/discordgo"
)

var (
	// Used to store all of the functions that handle each command
	discordCommandMap = make(map[string]func(*discordgo.MessageCreate, []string))
)

func discordCommandInit() {
	// Special commands
	discordCommandMap["replay"] = discordCommandReplay
	discordCommandMap["link"] = discordCommandReplay
	discordCommandMap["game"] = discordCommandReplay

	// Info commands
	discordCommandMap["2pquestion"] = discordCommand2PQuestion
	discordCommandMap["2player"] = discordCommand2PQuestion
	discordCommandMap["2p"] = discordCommand2PQuestion
	discordCommandMap["badquestion"] = discordCommandBadQuestion
	discordCommandMap["bga"] = discordCommandBGA
	discordCommandMap["efficiency"] = discordCommandEfficiency
	discordCommandMap["level"] = discordCommandLevel
	discordCommandMap["loweffort"] = discordCommandLowEffort
	discordCommandMap["notation"] = discordCommandNotation
	discordCommandMap["oop"] = discordCommandOOP
	discordCommandMap["screenshot"] = discordCommandScreenshot
	discordCommandMap["noreplay"] = discordCommandScreenshot
	discordCommandMap["undefined"] = discordCommandUndefined
}

func discordCommand(m *discordgo.MessageCreate, command string, args []string) {
	// Check to see if there is a command handler for this command
	if discordCommandFunction, ok := discordCommandMap[command]; ok {
		discordCommandFunction(m, args)
	}
	// (do nothing if they sent an invalid command)
}

func discordCommandReplay(m *discordgo.MessageCreate, args []string) {
	if len(args) == 0 {
		msg := "The format of the /replay command is: /replay [game ID] [turn number]"
		discordSend(m.ChannelID, "", msg)
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
}

func discordCommand2PQuestion(m *discordgo.MessageCreate, args []string) {
	msg := "Ask questions about 2-player games in the <#712153960709881888> channel."
	discordSend(m.ChannelID, "", msg)
}

func discordCommandBadQuestion(m *discordgo.MessageCreate, args []string) {
	msg := "Your question is not specific enough. In order to properly answer it, we need to know the amount of players in the game, all of the cards in all of the hands, the amount of current clues, and so forth. Please type out a full Alice and Bob story in the style of the reference document. (e.g. <https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#the-reverse-finesse>)"
	discordSend(m.ChannelID, "", msg)
}

func discordCommandBGA(m *discordgo.MessageCreate, args []string) {
	msg := "If you have experience playing with the Board Game Arena convention framework and you are interested in playing with the Hyphen-ated group, then read this: <https://github.com/Zamiell/hanabi-conventions/blob/master/misc/BGA.md>"
	discordSend(m.ChannelID, "", msg)
}

func discordCommandEfficiency(m *discordgo.MessageCreate, args []string) {
	msg := "<https://github.com/Zamiell/hanabi-conventions/blob/master/misc/BGA.md>"
	discordSend(m.ChannelID, "", msg)
}

func discordCommandLevel(m *discordgo.MessageCreate, args []string) {
	msg := "When asking questions in the #convention-questions channel, please remember to include the convention level that the current players of the game are playing with."
	discordSend(m.ChannelID, "", msg)
}

func discordCommandLowEffort(m *discordgo.MessageCreate, args []string) {
	msg := "It looks like you are asking a low-effort question. Update your question to explain what **you** think the best answer is, based on your current understanding of the conventions. Provide a detailed explanation as to **why** you think it is the best answer. Discuss any relevant contextual clues present in the game that influence the answer, if any. Provide an alternate answer that might also be the case and discuss why that answer is not as good. This allows us to hone in on the specific gaps in your knowledge."
	discordSend(m.ChannelID, "", msg)
}

func discordCommandNotation(m *discordgo.MessageCreate, args []string) {
	msg := "It looks like you are using non-standard card notation in your question. Please use notation that the Hyphen-ated group will be familiar with. For example:\n- Use \"red 3\" instead of \"3 red\".\n- Use \"r3\" instead of \"3r\".\n- Use \"r[3]\" to indicate that a card is a red 3 but has a number 3 clue on it.\n- Always use the characters of Alice, Bob, Cathy, Donald, Emily, and Frank instead of real player names. Alice should always be the player who performs the first action, and so forth."
	discordSend(m.ChannelID, "", msg)
}

func discordCommandOOP(m *discordgo.MessageCreate, args []string) {
	msg := "It looks like you are asking a question about an *Out-of-Position Bluff* (or OOP for short). When asking such questions, **you must include** the condition that you think is satisfied (i, ii, or iii)."
	discordSend(m.ChannelID, "", msg)
}

func discordCommandScreenshot(m *discordgo.MessageCreate, args []string) {
	msg := "It looks like you have posted a screenshot of a game state. When asking questions in the #convention-questions channel, please **do not post a screenshot** and instead use the `/replay` command to generate a link to the specific turn of the game in question."
	discordSend(m.ChannelID, "", msg)
}

func discordCommandUndefined(m *discordgo.MessageCreate, args []string) {
	msg := "**Why isn't [situation X] defined in the conventions document?**\n\n"
	msg += "Not everything has to have a meaning. We intentionally want to have some situations be undefined so that we have some wiggle room to handle a wide variety of game states: <https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Convention_Goals.md>"
	discordSend(m.ChannelID, "", msg)
}
