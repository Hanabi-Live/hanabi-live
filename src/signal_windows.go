// +build windows

package main

/*
	We want to be able to control the server from the command-line without actually having to send
	chat messages to the lobby. However, this feature will not work on Windows, and will even stop
	the program from compiling because syscall.SIGUSR1 does not exist. Thus, we use Golang build
	constraints/tags.
*/

func signalInit() {
}
