package main

import (
	"github.com/tevino/abool"
)

var (
	maintenanceMode = abool.New()
)

func maintenance(enabled bool) {
	maintenanceMode.SetTo(enabled)
	notifyAllMaintenance()
	msg := ""
	if enabled {
		msg += "The server is entering maintenance mode."
	} else {
		msg += "Server maintenance is complete."
	}
	msg += " New game creation has been "
	if enabled {
		msg += "enabled."
	} else {
		msg += "disabled."
	}
	chatServerSendAll(msg)
}
