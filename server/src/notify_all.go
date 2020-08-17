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
	sessionsMutex.RLock()
	for _, s2 := range sessions {
		s2.NotifyUserLeft(s)
	}
	sessionsMutex.RUnlock()
}

func notifyAllUserInactive(s *Session) {
	sessionsMutex.RLock()
	for _, s2 := range sessions {
		s2.NotifyUserInactive(s)
	}
	sessionsMutex.RUnlock()
}

func notifyAllTable(t *Table) {
	if !t.Visible {
		return
	}

	sessionsMutex.RLock()
	for _, s := range sessions {
		s.NotifyTable(t)
	}
	sessionsMutex.RUnlock()
}

func notifyAllTableGone(t *Table) {
	if !t.Visible {
		return
	}

	sessionsMutex.RLock()
	for _, s := range sessions {
		s.NotifyTableGone(t)
	}
	sessionsMutex.RUnlock()
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
