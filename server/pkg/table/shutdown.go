package table

// Shutdown stops all requests to prepare for an impending server shutdown.
// It will block until all existing requests are finished processing.
func (m *Manager) Shutdown() {
	// Local variables
	t := m.table

	m.shutdownMutex.Lock()
	defer m.shutdownMutex.Unlock()

	if m.requestsClosed.IsSet() {
		m.logger.Errorf(
			"The %v manager received a shutdown request, but requests have already been closed.",
			m.name,
		)
		return
	}

	m.logger.Infof("Shutting down the %v %v manager.", m.name, t.ID)

	// Prevent new requests
	m.requestsClosed.Set()

	// Put the shutdown request on the request queue
	m.requests <- &request{
		reqType: requestTypeShutdown,
		data:    nil,
	}

	// The request processing goroutine will continue to process all of the queued requests
	// When it reaches the shutdown request, then it will exit
	// Wait for this to happen
	m.requestsWaitGroup.Wait()

	// Terminate any children goroutines by putting a message on the channel
	t.idleDetectorChannel <- true
	t.timerDetectorChannel <- true

	// If this is an unstarted game, remove all existing players from the table
	if !t.Running {
		for len(t.Players) > 0 {
			p := t.Players[0]
			m.leave(&leaveData{
				userID:         p.UserID,
				username:       p.Username,
				resultsChannel: make(chan *LeaveReturnData),
			})
		}
	}

	// If this is a replay, remove all existing spectators from the table
	if t.Replay {
		for len(t.spectators) > 0 {
			sp := t.spectators[0]
			m.unspectate(&unspectateData{
				userID:         sp.userID,
				username:       sp.username,
				resultsChannel: make(chan bool),
			})
		}
	}

	m.logger.Infof("The %v %v manager has been shut down.", m.name, t.ID)
}
