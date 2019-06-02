package main

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

const (
	// When sending the in-game chat history,
	// only send the last X messages to prevent clients from becoming overloaded
	// (in case someone maliciously spams a lot of messages)
	chatLimit = 1000
)

var (
	mentionRegExp = regexp.MustCompile(`&lt;@!*(\d+?)&gt;`)
	channelRegExp = regexp.MustCompile(`&lt;#(\d+?)&gt;`)
)

/*
	Chat command functions
*/

func chatHere(s *Session, d *CommandData) {
	// Check to see if enough time has passed from the last @here
	msg := ""
	if time.Since(discordLastAtHere) < discordAtHereTimeout {
		timeCanPingAgain := discordLastAtHere.Add(discordAtHereTimeout)
		minutesLeft := int(math.Ceil(time.Until(timeCanPingAgain).Minutes()))
		msg += "In order to prevent spam, "
		msg += "you need to wait another " + strconv.Itoa(minutesLeft) + " minutes "
		msg += "before you can send out another mass ping."
	} else {
		// If the command was sent from the lobby, "d.Username" will be blank
		if d.Username == "" && s != nil {
			d.Username = s.Username()
		}
		msg += d.Username + " wants to play. Anyone "
		test := false
		if len(d.Args) > 0 && d.Args[0] == "test" {
			test = true
			msg += "here? (This is just a test.)"
		} else {
			msg += "@here?"
		}
		if len(d.Args) > 0 && d.Args[0] != "" && d.Args[0] != "test" {
			msg += " " + strings.Join(d.Args, " ")
		}

		// Record the time of the "@here" ping so that we can enforce the time limit
		if !test {
			discordLastAtHere = time.Now()
			if err := db.DiscordMetadata.Put("last_at_here", discordLastAtHere.Format(time.RFC3339)); err != nil {
				log.Error("Failed to update the database for the last @here:", err)
				return
			}
		}
	}
	if len(waitingList) > 0 {
		msg += "\n" + waitingListGetNum() + ":\n"
		for _, waiter := range waitingList {
			msg += waiter.DiscordMention + ", "
		}
		msg = strings.TrimSuffix(msg, ", ")
	}
	chatServerSend(msg)
}

func chatLast(s *Session, d *CommandData) {
	// Get the time elapsed since the last @here
	elapsedMinutes := int(math.Ceil(time.Since(discordLastAtHere).Minutes()))
	msg := "It has been " + strconv.Itoa(elapsedMinutes) + " minutes since the last mass ping."
	chatServerSend(msg)
}

func chatDiscord(s *Session, d *CommandData) {
	msg := "Join the Hanabi Discord server: https://discord.gg/FADvkJp"
	chatServerSend(msg)
}

func chatRandom(s *Session, d *CommandData) {
	errorMsg := "That is not a correct usage of the /random command."

	// We expect something like "/random 2" or "/random 1 2"
	if len(d.Args) != 1 && len(d.Args) != 2 {
		chatServerSend(errorMsg)
		return
	}

	// Ensure that both arguments are numbers
	var arg1, arg2 int
	if v, err := strconv.Atoi(d.Args[0]); err != nil {
		chatServerSend(errorMsg)
		return
	} else {
		arg1 = v
	}
	if len(d.Args) == 2 {
		if v, err := strconv.Atoi(d.Args[1]); err != nil {
			chatServerSend(errorMsg)
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
		chatServerSend(errorMsg)
		return
	}

	randNum := getRandom(min, max)
	msg := "Random number between " + strconv.Itoa(min) + " and " + strconv.Itoa(max) + ": " + strconv.Itoa(randNum)
	chatServerSend(msg)
}

/*
	Subroutines
*/

type ChatMessage struct {
	Msg      string    `json:"msg"`
	Who      string    `json:"who"`
	Discord  bool      `json:"discord"`
	Server   bool      `json:"server"`
	Datetime time.Time `json:"datetime"`
	Room     string    `json:"room"`
}

func chatMakeMessage(msg string, who string, discord bool, server bool, datetime time.Time, room string) *ChatMessage {
	return &ChatMessage{
		Msg:      msg,
		Who:      who,
		Discord:  discord,
		Server:   server,
		Datetime: datetime,
		Room:     room,
	}
}

// chatServerSend is a helper function to give feedback to a user after they type a command
// (for the lobby / Discord)
func chatServerSend(msg string) {
	commandChat(nil, &CommandData{
		Msg:    msg,
		Room:   "lobby",
		Server: true,
	})
}

// chatServerPregameSend is a helper function to give feedback to a user after they type a command
// (for the pre-game chat)
func chatServerPregameSend(msg string, gameID int) {
	commandChat(nil, &CommandData{
		Msg:    msg,
		Room:   "game",
		GameID: gameID,
		Server: true,
	})
}

func chatFillMentions(msg string) string {
	/*
		Discord mentions are in the form of "<@12345678901234567>"
		By the time the message gets here, it will be sanitized to "&lt;@12345678901234567&gt;"
		They can also be in the form of "<@!12345678901234567>" (with a "!" after the "@")
		if a nickname is set for that person
		We want to convert this to the username,
		so that the lobby displays messages in a manner similar to the Discord client
	*/

	if discord == nil {
		return msg
	}

	for {
		match := mentionRegExp.FindStringSubmatch(msg)
		if match == nil || len(match) <= 1 {
			break
		}
		discordID := match[1]
		username := discordGetNickname(discordID)
		msg = strings.Replace(msg, "&lt;@"+discordID+"&gt;", "@"+username, -1)
		msg = strings.Replace(msg, "&lt;@!"+discordID+"&gt;", "@"+username, -1)
	}
	return msg
}

func chatFillChannels(msg string) string {
	/*
		Discord channels are in the form of "<#380813128176500736>"
		By the time the message gets here, it will be sanitized to "&lt;#380813128176500736&gt;"
	*/

	if discord == nil {
		return msg
	}

	for {
		match := channelRegExp.FindStringSubmatch(msg)
		if match == nil || len(match) <= 1 {
			break
		}
		discordID := match[1]
		channel := discordGetChannel(discordID)
		msg = strings.Replace(msg, "&lt;#"+discordID+"&gt;", "#"+channel, -1)
	}
	return msg
}

type ChatListMessage struct {
	List   []*ChatMessage `json:"list"`
	Unread int            `json:"unread"`
}

func chatSendPastFromDatabase(s *Session, room string, count int) {
	var rawMsgs []models.ChatMessage
	if v, err := db.ChatLog.Get(room, count); err != nil {
		log.Error("Failed to get the lobby chat history for user \""+s.Username()+"\":", err)
		return
	} else {
		rawMsgs = v
	}

	msgs := make([]*ChatMessage, 0)
	for i := len(rawMsgs) - 1; i >= 0; i-- {
		// The chat messages were queried from the database in order from newest to newest
		// We want to send them to the client in the reverse order so that
		// the newest messages display at the bottom
		rawMsg := rawMsgs[i]
		discord := false
		server := false
		if rawMsg.Name == "__server" {
			server = true
		}
		if rawMsg.DiscordName.Valid {
			server = false
			discord = true
			rawMsg.Name = rawMsg.DiscordName.String
		}
		rawMsg.Message = chatFillMentions(rawMsg.Message)
		msg := chatMakeMessage(rawMsg.Message, rawMsg.Name, discord, server, rawMsg.Datetime, room)
		msgs = append(msgs, msg)
	}
	s.Emit("chatList", &ChatListMessage{
		List:   msgs,
		Unread: 0, // This is only used for in-game chat
	})
}

func chatSendPastFromGame(s *Session, g *Game) {
	chatList := make([]*ChatMessage, 0)
	i := 0
	if len(g.Chat) > chatLimit {
		i = len(g.Chat) - chatLimit
	}
	for ; i < len(g.Chat); i++ {
		// We have to convert the *GameChatMessage to a *ChatMessage
		gcm := g.Chat[i]
		cm := chatMakeMessage(gcm.Msg, gcm.Username, false, gcm.Server, gcm.Datetime, "game")
		chatList = append(chatList, cm)
	}
	s.Emit("chatList", &ChatListMessage{
		List:   chatList,
		Unread: len(g.Chat) - g.ChatRead[s.UserID()],
	})
}
