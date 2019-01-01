package main

func noteFormat(name string, note string) string {
	if note == "" {
		return ""
	}

	note = "<strong>" + name + ":</strong> " + note + "<br />"

	return note
}
