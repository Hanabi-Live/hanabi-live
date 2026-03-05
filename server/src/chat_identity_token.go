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

	chatTokenGenerateOrGet(s, d.Room)
}

func chatTokenGenerateOrGet(s *Session, room string) {
	exists, row, err := models.UserIdentityTokens.Get(s.UserID)
	if err != nil {
		logger.Error("Failed to retrieve identity token for user \"" + s.Username + "\": " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	}

	if exists && !identityTokenIsExpired(row.ExpiresAt) {
		token, err := identityTokenDecrypt(row.TokenEncrypted)
		if err != nil {
			logger.Error("Failed to decrypt identity token for user \"" + s.Username + "\": " + err.Error())
			s.Error(DefaultErrorMsg)
			return
		}

		msg := "Identity token (valid until " + row.ExpiresAt.UTC().Format(time.RFC3339) + " UTC): " +
			"<code>" + token + "</code>"
		chatServerSendPM(s, msg, room)
		return
	}

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
