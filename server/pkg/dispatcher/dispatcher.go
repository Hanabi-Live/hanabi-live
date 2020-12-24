package dispatcher

// Dispatcher is injected into different server components as a mechanism to avoid circular imports.
// (The different sub-packages of the server need to communicate with each other.)
type Dispatcher struct {
	Characters CharactersManager
	Chat       ChatManager
	Commands   CommandsManager
	Core       CoreManager
	Discord    DiscordManager
	GitHub     GitHubManager
	HTTP       HTTPMainManager
	Tables     TablesManager
	Sessions   SessionsManager
	Variants   VariantsManager
}
