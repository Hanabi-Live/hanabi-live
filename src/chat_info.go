package main

// /badhere
func chatBadHere(s *Session, d *CommandData, t *Table) {
	if t != nil {
		chatServerSend(ChatCommandNotInLobbyFail, d.Room)
		return
	}

	msg := "It looks like there are already some Hyphen-ated members playing in one of the voice " +
		"channels. Did you already ask to join them in their next game? Unless there is a " +
		"specific reason (e.g. experts playing a variant that is too difficult for a beginner), " +
		"then you should make an effort to join existing players **before** pinging the rest of " +
		"the server. The \"/here\" command is generally only used when there is no-one around " +
		"and playing a game already."
	chatServerSend(msg, d.Room)
}

// /wrongchannel
func chatWrongChannel(s *Session, d *CommandData, t *Table) {
	if t != nil {
		chatServerSend(ChatCommandNotInLobbyFail, d.Room)
		return
	}

	msg := "It looks like you are asking a question about the Hyphen-ated conventions or the " +
		"Hyphen-ated group. Please put all such questions in the #questions-and-help channel."
	chatServerSend(msg, d.Room)
}
