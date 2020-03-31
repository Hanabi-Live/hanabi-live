/*
	Sent when the user gets a JavaScript error
	"data" example:
	{
		message: 'Uncaught ReferenceError: asdf is not defined',
		url: 'https://hanabi.live/public/js/ui.js',
		lineno: 892,
		colno: 13,
	}
*/

package main

import (
	"strconv"
)

func commandClientError(s *Session, d *CommandData) {
	msg := "User \"" + s.Username() + "\" got a client error:\n"
	msg += "\t" + d.Message + "\n"
	msg += "\t" + d.URL + "\n"
	msg += "\t" + strconv.Itoa(d.LineNum) + ":" + strconv.Itoa(d.ColNum)
	logger.Error(msg)
}
