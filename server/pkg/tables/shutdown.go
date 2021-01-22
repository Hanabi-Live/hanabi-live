package tables

// Shutdown stops all requests to prepare for an impending server shutdown.
// It will block until all existing requests are finished processing.
func (m *Manager) Shutdown() {
	m.shutdownMutex.Lock()
	defer m.shutdownMutex.Unlock()

	if m.requestsClosed.IsSet() {
		m.logger.Errorf(
			"The %v manager received a shutdown request, but requests have already been closed.",
			m.name,
		)
		return
	}

	m.logger.Infof("Shutting down the %v manager.", m.name)

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

	// Kill all tables
	for tableID, t := range m.tables {
		m.delete(tableID, t)
	}

	m.logger.Infof("The %v manager has been shut down.", m.name)
}
