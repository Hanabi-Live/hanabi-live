package main

type Spectator struct {
	ID            int
	Name          string
	Index         int
	ChatReadIndex int

	Session *Session
}
