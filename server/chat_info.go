package main

import (
	"context"
)

// /here
func chatHere(ctx context.Context, s *Session, d *CommandData, t *Table) {
	if t != nil {
		chatServerSend(ctx, NotInLobbyFail, d.Room, d.NoTablesLock)
		return
	}

	msg := "The /here command has been removed. If you look at the Discord voice channels to your left, there are almost certainly people from the Hyphen-ated group already playing or reviewing a game. Please politely ask to join them instead of pinging the entire server."
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /wrongchannel
func chatWrongChannel(ctx context.Context, s *Session, d *CommandData, t *Table) {
	if t != nil {
		chatServerSend(ctx, NotInLobbyFail, d.Room, d.NoTablesLock)
		return
	}

	// This includes a discord link to the #convention-questions channel
	msg := "It looks like you are asking a question about the Hyphen-ated conventions or the Hyphen-ated group. Please ask all such questions in the <#456214043351580674> channel."
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
