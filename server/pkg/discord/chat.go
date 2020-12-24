package discord

import (
	"strings"
)

func (m *Manager) ChatFill(msg string) string {
	if m == nil {
		// The manager is not initialized
		return msg
	}

	if m.ready.IsNotSet() {
		// We are not yet connected
		return msg
	}

	msg = m.chatFillChannels(msg)
	msg = m.chatFillMentions(msg)

	return msg
}

func (m *Manager) chatFillChannels(msg string) string {
	// Discord channels are in the form of "<#380813128176500736>"
	// By the time the message gets here, it will be sanitized to "&lt;#380813128176500736&gt;"
	// We want to convert this to the real channel name,
	// so that the lobby displays messages in a manner similar to the Discord client
	for {
		match := m.channelRegExp.FindStringSubmatch(msg)
		if match == nil || len(match) <= 1 {
			break
		}
		discordID := match[1]
		channel := m.getChannelName(discordID)
		msg = strings.ReplaceAll(msg, "&lt;#"+discordID+"&gt;", "#"+channel)
	}

	return msg
}

func (m *Manager) chatFillMentions(msg string) string {
	// Discord mentions are in the form of "<@12345678901234567>"
	// By the time the message gets here, it will be sanitized to "&lt;@12345678901234567&gt;"
	// They can also be in the form of "<@!12345678901234567>" (with a "!" after the "@"),
	// if a nickname is set for that person
	// We want to convert this to the username,
	// so that the lobby displays messages in a manner similar to the Discord client
	for {
		match := m.mentionRegExp.FindStringSubmatch(msg)
		if match == nil || len(match) <= 1 {
			break
		}
		discordID := match[1]
		username := m.getNickname(discordID)
		msg = strings.ReplaceAll(msg, "&lt;@"+discordID+"&gt;", "@"+username)
		msg = strings.ReplaceAll(msg, "&lt;@!"+discordID+"&gt;", "@"+username)
	}

	return msg
}
