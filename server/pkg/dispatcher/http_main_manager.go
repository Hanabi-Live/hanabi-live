package dispatcher

type HTTPMainManager interface {
	Domain() string
	UseTLS() bool
}
