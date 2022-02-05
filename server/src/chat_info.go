package main

import (
	"context"

	"github.com/bwmarrin/discordgo"
)

// /here, /ping
func chatHere(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if t != nil {
		chatServerSend(ctx, NotInLobbyFail, d.Room, d.NoTablesLock)
		return
	}

	if discord == nil {
		chatServerSendPM(s, "Discord is not available at this time.", d.Room)
		return
	}

	var pingCrew *discordgo.Role
	if v, ok := discordGetRoleByName(discordPingCrew); !ok {
		chatServerSendPM(s, "The @Ping Crew role could not be found.", d.Room)
		return
	} else {
		pingCrew = v
	}

	msg := d.Username + " is looking for a game. <@&" + pingCrew.ID + ">"
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /teachme
func chatTeachMe(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if t != nil {
		chatServerSend(ctx, NotInLobbyFail, d.Room, d.NoTablesLock)
		return
	}

	if discord == nil {
		chatServerSendPM(s, "Discord is not available at this time.", d.Room)
		return
	}

	var trustedTeacher *discordgo.Role
	if v, ok := discordGetRoleByName(discordTrustedTeacher); !ok {
		chatServerSendPM(s, "The @Trusted Teacher role could not be found.", d.Room)
		return
	} else {
		trustedTeacher = v
	}

	msg := d.Username + " is looking for a teaching game. <@&" + trustedTeacher.ID + ">"
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /subscribe, /unsubscribe
func chatSubscribe(ctx context.Context, s *Session, d *CommandData, t *Table) {
	chatServerSendPM(s, "You can only use that command on Discord.", d.Room)
}

// /wrongchannel
func chatWrongChannel(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if t != nil {
		chatServerSend(ctx, NotInLobbyFail, d.Room, d.NoTablesLock)
		return
	}

	// This includes a discord link to the #convention-questions channel
	msg := "It looks like you are asking a question about the H-Group. Please ask all such questions in the <#456214043351580674> channel."
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
