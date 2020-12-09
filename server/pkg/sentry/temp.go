package sentry

/*
func sentryWebsocketMessageAttachMetadata(s *Session) {
	if !usingSentry {
		return
	}

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(s.ms.Request.RemoteAddr); err != nil {
		hLog.Errorf("Failed to parse the IP address from \"%v\": %v", s.ms.Request.RemoteAddr, err)
		return
	} else {
		ip = v
	}

	// If we encounter an error later on, we want metadata to be attached to the error message,
	// which can be helpful for debugging (since we can ask the user how they caused the error)
	// We use "SetTags()" instead of "SetUser()" since tags are more easy to see in the
	// Sentry GUI than users
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag("userID", strconv.Itoa(s.UserID))
		scope.SetTag("username", s.Username)
		scope.SetTag("ip", ip)
		scope.SetTag("path", "n/a")
	})
}
*/
