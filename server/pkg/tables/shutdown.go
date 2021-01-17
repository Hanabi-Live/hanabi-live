package tables

// Shutdown stops all requests to prepare for an impending server shutdown.
// It will block until all existing requests are finished processing.
func (m *Manager) Shutdown() {
	// Do nothing if we are already in the process of shutting down
	if m.requestsClosed.IsSet() {
		return
	}

	// Prevent new requests
	m.requestsClosed.Set()

	// Put the shutdown request on the request queue
	m.requests <- &request{
		reqType: requestTypeShutdown,
	}

	// The request processing goroutine will continue to process all of the queued requests
	// When it reaches the shutdown request, then it will exit
	// Wait for this to happen
	m.requestsWaitGroup.Wait()

	// TODO CLOSE ALL TABLES
	// THIS WILL USE THE CODE THAT I WRITE FOR TABLE_LEAVE
}
