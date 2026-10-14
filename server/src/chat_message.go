package main

import "time"

// chatMessageContent contains fields shared by internal chat variants.
// Source describes the author, independently of the delivery destination.
type chatMessageContent struct {
	msg      string
	who      string
	source   ChatLogSource
	datetime time.Time
}

func (m chatMessageContent) wire() ChatMessage {
	return ChatMessage{
		Msg:      m.msg,
		Who:      m.who,
		Discord:  m.source == ChatLogSourceDiscord,
		Server:   m.source == ChatLogSourceServer,
		Datetime: m.datetime,
	}
}

func chatMessageSource(discord bool, server bool) ChatLogSource {
	if discord {
		return ChatLogSourceDiscord
	}
	if server {
		return ChatLogSourceServer
	}
	return ChatLogSourceUser
}

// Different internal variants expose only the IDs and recipients they can have.
type lobbyChatEvent struct {
	content chatMessageContent
	room    string
	chatID  int
}

func (m lobbyChatEvent) wire() *ChatMessage {
	msg := m.content.wire()
	msg.Room = m.room
	msg.ChatID = m.chatID
	return &msg
}

type tableChatEvent struct {
	content chatMessageContent
	room    string
}

func (m tableChatEvent) wire() *ChatMessage {
	msg := m.content.wire()
	msg.Room = m.room
	return &msg
}

type privateChatEvent struct {
	content   chatMessageContent
	pmID      int
	recipient string
}

func (m privateChatEvent) wire() *ChatMessage {
	msg := m.content.wire()
	msg.PMID = m.pmID
	msg.Recipient = m.recipient
	return &msg
}

// Notices are server-originated and may be public or directed to one user.
// A notice's room still determines where it appears in the legacy client.
type noticeChatEvent struct {
	msg       string
	who       string
	datetime  time.Time
	room      string
	recipient string
}

func (m noticeChatEvent) wire() *ChatMessage {
	msg := chatMessageContent{
		msg:      m.msg,
		who:      m.who,
		source:   ChatLogSourceServer,
		datetime: m.datetime,
	}.wire()
	msg.Room = m.room
	msg.Recipient = m.recipient
	return &msg
}
