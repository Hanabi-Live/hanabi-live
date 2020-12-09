package main

import (
	"context"
	"fmt"

	"github.com/tevino/abool"
)

var (
	maintenanceMode = abool.New()
)

func maintenance(ctx context.Context, enabled bool) {
	maintenanceMode.SetTo(enabled)
	notifyAllMaintenance()

	var whatsHappeningString string
	var verb string
	if enabled {
		whatsHappeningString = "The server is entering maintenance mode."
		verb = "enabled"
	} else {
		whatsHappeningString = "Server maintenance is complete."
		verb = "disabled"
	}

	// We must acquires the tables lock before entering the "chatServerSendAll()" function
	tables.Lock(ctx)
	defer tables.Unlock(ctx)

	msg := fmt.Sprintf("%v New game creation has been %v.", whatsHappeningString, verb)
	chatServerSendAll(ctx, msg)
}
