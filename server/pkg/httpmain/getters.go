package httpmain

func (m *Manager) Domain() string {
	return m.domain
}

func (m *Manager) UseTLS() bool {
	return m.useTLS
}
