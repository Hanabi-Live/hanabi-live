package main

import (
	"github.com/microcosm-cc/bluemonday"
)

func noteFormat(name string, note string) string {
	if note == "" {
		return ""
	}

	// Sanitize the note using the bluemonday library to stop
	// various attacks against other players reading the notes
	p := bluemonday.StrictPolicy()
	note = p.Sanitize(note)

	note = "<strong>" + name + ":</strong> " + note + "<br />"

	return note
}
