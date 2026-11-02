package main

import (
	"context"
	"testing"
)

func TestLobbyCommandAdmissionPrecedesPersistence(t *testing.T) {
	database := gamePersistenceDatabase(t)
	oldDB, oldModels, oldCommands := db, models, chatCommandMap
	db, models = database, &Models{}
	calls := 0
	chatCommandMap = map[string]func(context.Context, *Session, *CommandData, *Table, string){
		"known": func(context.Context, *Session, *CommandData, *Table, string) { calls++ },
	}
	t.Cleanup(func() { db, models, chatCommandMap = oldDB, oldModels, oldCommands })
	count := func() int {
		var rows int
		if err := db.QueryRow(context.Background(), "SELECT COUNT(*) FROM chat_log").Scan(&rows); err != nil {
			t.Fatal(err)
		}
		return rows
	}
	before := count()
	session := NewFakeSession(1, "Alice")
	ctx := NewMiscContext("chat-command-test")
	commandChat(ctx, session, &CommandData{Msg: "/unknown-command", Room: "lobby"})
	if count() != before || calls != 0 {
		t.Fatal("an unknown command entered public history")
	}
	commandChat(ctx, nil, &CommandData{Msg: "/known", Room: "lobby", Server: true})
	if count() != before+1 || calls != 0 {
		t.Fatal("a server notice executed a user command")
	}
	commandChat(ctx, session, &CommandData{Msg: "/known", Room: "lobby"})
	if count() != before+2 || calls != 1 {
		t.Fatal("an admitted user command was not recorded and executed")
	}
}

func TestUnknownTableCommandDoesNotEnterChat(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	table.Running = false
	old := chatCommandMap
	chatCommandMap = make(map[string]func(context.Context, *Session, *CommandData, *Table, string))
	t.Cleanup(func() { chatCommandMap = old })
	before := len(table.Chat)
	commandChat(ctx, NewFakeSession(1, "Alice"), &CommandData{
		Msg: "/unknown-command", Room: table.GetRoomName(),
	})
	if len(table.Chat) != before {
		t.Fatal("an unknown command entered table chat")
	}
}
