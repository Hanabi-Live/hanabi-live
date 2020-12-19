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
		msg += "enabled."
	} else {
		msg += "disabled."
	}

	// We must acquires the tables lock before entering the "chatServerSendAll()" function
	tables.Lock(ctx)
	defer tables.Unlock(ctx)

	chatServerSendAll(ctx, msg)
}
