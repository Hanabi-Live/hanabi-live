package table

func (m *Manager) IdleEnd() {
	m.newRequest(requestTypeIdleEnd, nil) // nolint: errcheck
}

func (m *Manager) idleEnd(data interface{}) {

}
