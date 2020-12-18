package dispatcher

// Dispatcher is injected into different server components as a mechanism to avoid circular imports.
// (The different sub-packages of the server need to communicate with each other.)
type Dispatcher struct {
	Commands *commandsManager
	Core     *coreManager
	Discord  *discordManager
	Tables   *tablesManager
	Sessions *sessionsManager
}
