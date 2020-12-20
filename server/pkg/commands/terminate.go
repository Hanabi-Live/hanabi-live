package commands

// Terminate stops all requests to prepare for an impending server termination.
// It will block until all existing requests are finished processing.
func (m *Manager) Terminate() {
	// Do nothing if we are already in the process of terminating
	if m.requestsClosed.IsSet() {
		return
	}

	// Prevent new requests
	m.requestsClosed.Set()

	// Put the termination request on the request queue
	m.requests <- &request{
		reqType: requestTypeTerminate,
	}

	// The request processing goroutine will continue to process all of the queued requests
	// When it reaches the termination request, then it will exit
	// Wait for this to happen
	m.requestsWaitGroup.Wait()
}
