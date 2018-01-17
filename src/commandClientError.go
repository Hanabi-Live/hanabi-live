/*
	Sent when the user gets a JavaScript error.
	"data" example:
	{
		message: 'asdf',
		url: '',
		lineno: '123',
		colno: '123',
		stack: '',
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
