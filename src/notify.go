package main

/*
	Functions that notify all currently connected users
*/

func notifyAllUser(s *Session) {
	for _, s2 := range sessions {
		s2.NotifyUser(s)
	}
}

func notifyAllUserLeft(s *Session) {
	for _, s2 := range sessions {
		s2.NotifyUserLeft(s)
	}
}

func notifyAllTable(g *Game) {
	if g.Visible {
		for _, s := range sessions {
			s.NotifyTable(g)
		}
	}
}

func notifyAllTableGone(g *Game) {
	if g.Visible {
		for _, s := range sessions {
			s.NotifyTableGone(g)
		}
	}
}
