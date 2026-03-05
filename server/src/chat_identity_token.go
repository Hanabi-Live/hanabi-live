package main

import (
	"context"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

func chatToken(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if s == nil {
		msg := "You cannot perform that command from Discord; please use the website instead."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	for _, arg := range d.Args {
		if arg != "" {
			chatServerSendPM(s, "The format of the /token command is: /token", d.Room)
			return
		}
	}

	chatTokenGenerateOrRegenerate(s, d.Room)
}

func chatTokenGenerateOrRegenerate(s *Session, room string) {
	row, token, err := identityTokenRegenerate(s.UserID)
	if err != nil {
		logger.Error("Failed to regenerate identity token for user \"" + s.Username + "\": " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	}

	msg := "Identity token (valid until " + row.ExpiresAt.UTC().Format(time.RFC3339) + " UTC): " +
		"<code>" + token + "</code>"
	chatServerSendPM(s, msg, room)
}
