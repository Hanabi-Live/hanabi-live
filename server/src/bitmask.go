package main

// From: https://stackoverflow.com/questions/48050522/using-bitsets-in-golang-to-represent-capabilities
type Bitmask uint32

func (f Bitmask) HasFlag(flag Bitmask) bool {
	return f&flag != 0
}
func (f *Bitmask) AddFlag(flag Bitmask) {
	*f |= flag
}
func (f *Bitmask) ClearFlag(flag Bitmask) {
	*f &= ^flag
}
func (f *Bitmask) ToggleFlag(flag Bitmask) {
	*f ^= flag
}
