package main

import "sync"

// Accepted commands hold a read lock until completion. Draining excludes new admissions.
type commandGate struct {
	mutex   sync.RWMutex
	blocked bool
}

func (g *commandGate) enter() bool {
	g.mutex.RLock()
	if g.blocked {
		g.mutex.RUnlock()
		return false
	}
	return true
}

func (g *commandGate) leave() {
	g.mutex.RUnlock()
}

func (g *commandGate) drain() {
	g.mutex.Lock()
	g.blocked = true
	g.mutex.Unlock()
}

func (g *commandGate) resume() {
	g.mutex.Lock()
	g.blocked = false
	g.mutex.Unlock()
}
