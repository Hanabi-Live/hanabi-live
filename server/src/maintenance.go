package main

import (
	"context"

	"github.com/tevino/abool"
)

var (
	maintenanceMode = abool.New()
)

func maintenance(ctx context.Context, enabled bool) {
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
		msg += "disabled."
	} else {
		msg += "enabled."
	}

	chatServerSendAll(ctx, msg)
}
