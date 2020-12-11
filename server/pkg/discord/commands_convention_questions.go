package discord

import (
	"context"

	"github.com/bwmarrin/discordgo"
)

// nolint: godot
// /2p
func (m *Manager) command2P(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	msg := "Ask questions about 2-player games in the <#712153960709881888> channel."
	m.Send(mc.ChannelID, "", msg)
}

// nolint: godot
// /badquestion
func (m *Manager) commandBadQuestion(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	msg := "Your question is not specific enough. In order to properly answer it, we need to know the amount of players in the game, all of the cards in all of the hands, the amount of current clues, and so forth. Please type out a full Alice and Bob story in the style of the reference document. (e.g. <https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#the-reverse-finesse>)"
	m.Send(mc.ChannelID, "", msg)
}

// nolint: godot
// /level
func (m *Manager) commandLevel(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	msg := "When asking questions in the #convention-questions channel, please remember to include the convention level that the current players of the game are playing with."
	m.Send(mc.ChannelID, "", msg)
}

// nolint: godot
// /loweffort
func (m *Manager) commandLowEffort(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	msg := "It looks like you are asking a low-effort question. Update your question to explain what **you** think the best answer is, based on your current understanding of the conventions. Provide a detailed explanation as to **why** you think it is the best answer. Discuss any relevant contextual clues present in the game that influence the answer, if any. Provide an alternate answer that might also be the case and discuss why that answer is not as good. This allows us to hone in on the specific gaps in your knowledge."
	m.Send(mc.ChannelID, "", msg)
}

// nolint: godot
// /notation
func (m *Manager) commandNotation(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	msg := "It looks like you are using non-standard card notation in your question. Please use notation that the Hyphen-ated group will be familiar with. For example:\n- Use \"red 3\" instead of \"3 red\".\n- Use \"r3\" instead of \"3r\".\n- Use \"r[3]\" to indicate that a card is a red 3 but has a number 3 clue on it.\n- Always use the characters of Alice, Bob, Cathy, Donald, Emily, and Frank instead of real player names. Alice should always be the player who performs the first action, and so forth."
	m.Send(mc.ChannelID, "", msg)
}

// nolint: godot
// /oop
func (m *Manager) commandOOP(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	msg := "It looks like you are asking a question about an *Out-of-Position Bluff* (or OOP for short). When asking such questions, **you must include** the condition that you think is satisfied (i, ii, or iii)."
	m.Send(mc.ChannelID, "", msg)
}

// nolint: godot
// /screenshot
func (m *Manager) commandScreenshot(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	msg := "It looks like you have posted a screenshot of a game state. When asking questions in the #convention-questions channel, please **do not post a screenshot** and instead use the `/replay` command to generate a link to the specific turn of the game in question."
	m.Send(mc.ChannelID, "", msg)
}

// nolint: godot
// /undefined
func (m *Manager) commandUndefined(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	msg := "**Why isn't [situation X] defined in the conventions document?**\n\n"
	msg += "Not everything has to have a meaning. We intentionally want to have some situations be undefined so that we have some wiggle room to handle a wide variety of game states: <https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Convention_Goals.md>"
	m.Send(mc.ChannelID, "", msg)
}
