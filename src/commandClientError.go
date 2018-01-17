/*
	Sent when the user gets a JavaScript error.
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
	log.Info("User \"" + s.Username() + "\" got a client error:")
	log.Info(d.Message)
	log.Info(d.URL)
	log.Info(strconv.Itoa(d.LineNum) + ":" + strconv.Itoa(d.ColNum))
}
