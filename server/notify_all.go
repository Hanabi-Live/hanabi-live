// Functions that notify all currently connected users

package main

func notifyAllUser(s *Session) {
	sessionList := sessions2.GetList()
	for _, s2 := range sessionList {
		s2.NotifyUser(s)
	}
}

func notifyAllUserLeft(s *Session) {
	sessionList := sessions2.GetList()
	for _, s2 := range sessionList {
		s2.NotifyUserLeft(s)
	}
}

func notifyAllUserInactive(s *Session) {
	sessionList := sessions2.GetList()
	for _, s2 := range sessionList {
		s2.NotifyUserInactive(s)
	}
}

func notifyAllTable(t *Table) {
	if !t.Visible {
		return
	}

	sessionList := sessions2.GetList()
	for _, s := range sessionList {
		s.NotifyTable(t)
	}
}

func notifyAllTableGone(t *Table) {
	if !t.Visible {
		return
	}

	sessionList := sessions2.GetList()
	for _, s := range sessionList {
		s.NotifyTableGone(t)
	}
}

func notifyAllShutdown() {
	sessionList := sessions2.GetList()
	for _, s := range sessionList {
		s.NotifyShutdown()
	}
}

func notifyAllMaintenance() {
	sessionList := sessions2.GetList()
	for _, s := range sessionList {
		s.NotifyMaintenance()
	}
}
