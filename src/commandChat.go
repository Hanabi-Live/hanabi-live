/*
	Sent when the user sends a text message to the lobby by pressing enter
	"data" example:
	{
		msg: "hi",
	}
*/

package main

const (
	maxChatLength = 150
)

func commandChat(s *Session, d *CommandData) {
	// Local variables
	var userID int
	if d.Discord {
		userID = 0
	} else {
		userID = s.UserID()
	}
	var username string
	if d.Username != "" {
		username = d.Username
	} else {
		username = s.Username()
	}

	/*
		Validate
	*/

	// Validate the message
	if d.Msg == "" {
		s.NotifyError("You cannot send a blank message.")
		return
	}

	// Truncate long messages
	if len(d.Msg) > maxChatLength {
		d.Msg = d.Msg[0 : maxChatLength-1]
	}

	/*
		Chat
	*/

	// Add the message to the database
	if err := db.ChatLog.Insert(userID, d.Msg); err != nil {
		log.Error("Failed to insert a chat message into the database:", err)
		s.NotifyError("Failed to insert a chat message into the database. Please contact an administrator.")
		return
	}

	// Create the string to display on the client
	text := ""
	if d.Discord {
		text += "DISCORD "
	}
	if !d.Server || d.Discord {
		text += "<" + username + "> "
	}
	text += d.Msg
	log.Info(text)

	// Check for debug commands
	if d.Msg == "!debug" {
		debug(s, d)
		return
	}

	// Send the chat message to everyone
	for _, s2 := range sessions {
		s2.NotifyChat(d.Msg, username, d.Discord, d.Server)
	}

	// Send the chat message to the Discord "#general" channel
	// (but don't send Discord messages that we are already replicating)
	if !d.Discord {
		discordSend("Hanabi Live", username, d.Msg)
	}
}
