package main

import "sync"

// Accepted commands hold a read lock until completion. Draining excludes new admissions.
type commandGate struct {
	mutex   sync.RWMutex
	blocked bool
	resumed chan struct{}
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

// Cleanup callbacks must wait through a failed restart instead of being discarded.
func (g *commandGate) enterDeferred() {
	for {
		g.mutex.RLock()
		if !g.blocked {
			return
		}
		resumed := g.resumed
		g.mutex.RUnlock()
		<-resumed
	}
}

func (g *commandGate) drain() {
	g.mutex.Lock()
	if !g.blocked {
		g.blocked = true
		g.resumed = make(chan struct{})
	}
	g.mutex.Unlock()
}

func (g *commandGate) resume() {
	g.mutex.Lock()
	if g.blocked {
		g.blocked = false
		close(g.resumed)
		g.resumed = nil
	}
	g.mutex.Unlock()
}
