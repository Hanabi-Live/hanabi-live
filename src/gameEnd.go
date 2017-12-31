package main

func (g *Game) End() {
	// Send text messages showing how much time each player finished with
	if g.Options.Timed {
		// Advance a turn so that we have an extra separator before the finishing times
		g.Actions = append(g.Actions, &Action{
			Type: "turn",
			Num:  g.Turn,
			Who:  g.ActivePlayer,
		})
		// But don't notify the players; the finishing times will only appear in the replay

		for _, p := range g.Players {
			text := p.Name + " finished with a time of " + durationToString(p.Time)
			g.Actions = append(g.Actions, &Action{
				Text: text,
			})
			// But don't notify the players; the finishing times will only appear in the replay
			log.Info(g.GetName() + text)
		}
	}

	// Send the "gameOver" message
	loss := false
	if g.EndCondition > 1 {
		loss = true
	}
	g.Actions = append(g.Actions, &Action{
		Type:  "gameOver",
		Score: g.Score,
		Loss:  loss,
	})
	g.NotifyAction()

	// Send everyone a clock message with an active value of null, which
	// will get rid of the timers on the client-side
	g.NotifyTime()
}
