// +build !windows

package main

import (
	"os"
	"os/signal"
	"syscall"
)

// We want to be able to control the server from the command-line
// without having to send chat messages to the lobby
func signalInit() {
	signalChannel := make(chan os.Signal, 1)

	// Catch user defined signals 1 and 2
	// (these are meant to be used for application-specific purposes)
	signal.Notify(signalChannel, syscall.SIGUSR1, syscall.SIGUSR2)

	go signalListen()
}

func signalListen() {
	for {
		signal := <-signalChannel
		if signal == syscall.SIGUSR1 {
			// Gracefully restart
			graceful(true)
		} else if signal == syscall.SIGUSR2 {
			// Shutdown
			graceful(false)
		} else if signal == syscall.SIGUSR3 {
			// Debug
			debug()
		}
	}
}
