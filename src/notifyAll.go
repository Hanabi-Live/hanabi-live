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

func notifyAllTable(t *Table) {
	if t.Visible {
		for _, s := range sessions {
			s.NotifyTable(t)
		}
	}
}

func notifyAllTableProgress(t *Table) {
	if t.Visible {
		for _, s := range sessions {
			s.NotifyTableProgress(t)
		}
	}
}

func notifyAllTableGone(t *Table) {
	if t.Visible {
		for _, s := range sessions {
			s.NotifyTableGone(t)
		}
	}
}

func notifyAllShutdown() {
	for _, s := range sessions {
		s.NotifyShutdown()
	}
}
