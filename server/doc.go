/*
	The server is split up into subpackages relating to each individual server component. For
	example, HTTP requests are handled in the httpmain package, and WebSocket messages are handled
	in the sessions package. Most subpackages have their own "manager", which provides public access
	to the respective server component.

	Some managers are simple, and only provide thread-safe getter methods.

	Other managers are more complicated, and run on their own dedicated goroutine in order to
	listen for incoming requests on a channel. This channel acts as a queue. Thus, the manager will
	only perform one thing at a time (to maintain state sanity). Work can be performed by putting
	requests on the requests channel. The requests channel is private, so each manager provides
	thread-safe public helper methods in order to put requests on the queue.

	Some public methods are blocking because they involve requesting information. Since managers
	call on each others public methods, this has the potential to cause a deadlock. When managers
	call on another manager's blocking public method, it is carefully documented below.

	Additionally, managers using the public methods of other managers causes cyclic dependencies,
	which prevents compilation. In order to get around this, dependency injection is used in the
	form of a Dispatcher struct. First, each manager is initialized. Second, each manager's
	Dispatcher struct is populated with references to the other managers.

	The list of managers is as follows:

	- commands (has requests, so uses a wait group)
		Blocking requests:
		- NONE by design
	- core
	- discord
	- github
	- httplocalhost
	- httpmain
	- sessions (has requests, so uses a wait group)
		Blocking requests:
		- New
		- Print
	- table (has requests, so uses a wait group)
		Blocking requests:
		- ? FILL THIS OUT
	- tables (has requests, so uses a wait group)
		Blocking requests:
		- New
		- GetTables
		- GetUserTables
		- Print

	Managers that block on other managers:

	- sessions requests tables (in newSendTableList)
	- commands requests tables (in tableCreate)
	- tables requests table, but never the other way around

	Managers that block on other managers should use a comment of the following:
	// Blocking on a disparate server component
*/
package main
