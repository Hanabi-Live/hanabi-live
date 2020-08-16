// Functions that notify all currently connected users

package main

func notifyAllUser(s *Session) {
	sessionsMutex.RLock()
	for _, s2 := range sessions {
		s2.NotifyUser(s)
	}
	sessionsMutex.RUnlock()
}

func notifyAllUserLeft(s *Session) {
	// The sessions mutex is always locked by the time we get here
	for _, s2 := range sessions {
		s2.NotifyUserLeft(s)
	}
}

func notifyAllUserInactive(s *Session) {
	sessionsMutex.RLock()
	for _, s2 := range sessions {
		s2.NotifyUserInactive(s)
	}
	sessionsMutex.RUnlock()
}

func notifyAllTable(t *Table) {
	if t.Visible {
		sessionsMutex.RLock()
		for _, s := range sessions {
			s.NotifyTable(t)
		}
		sessionsMutex.RUnlock()
	}
}

func notifyAllTableGone(t *Table) {
	if t.Visible {
		sessionsMutex.RLock()
		for _, s := range sessions {
			s.NotifyTableGone(t)
		}
		sessionsMutex.RUnlock()
	}
}

func notifyAllShutdown() {
	sessionsMutex.RLock()
	for _, s := range sessions {
		s.NotifyShutdown()
	}
	sessionsMutex.RUnlock()
}

func notifyAllMaintenance() {
	sessionsMutex.RLock()
	for _, s := range sessions {
		s.NotifyMaintenance()
	}
	sessionsMutex.RUnlock()
}
