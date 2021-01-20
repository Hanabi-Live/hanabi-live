/*

The server is split up into subpackages relating to each individual server component. For
example, HTTP requests are handled in the httpmain package, and WebSocket messages are handled
in the sessions package. Most subpackages have their own "manager", which provides public access
to the respective server component.

Some managers are simple, and only provide thread-safe getter methods.

Other managers are more complicated, and run on their own dedicated goroutine in order to
listen for incoming requests on a channel. This channel acts as a queue. Thus, the manager will
only perform one thing at a time in order to maintain state sanity. Work can be performed by
putting requests on the requests channel. The requests channel is private, so each manager
provides thread-safe public helper methods in order to put requests on the queue.

Some public methods are blocking because they involve requesting information. Care has to be
taken to ensure that a manager does not call another manager's blocking public methods, since
this has the potential to cause a deadlock.

Additionally, managers using the public methods of other managers causes cyclic dependencies,
which prevents compilation. In order to get around this, dependency injection is used in the
form of a Dispatcher struct. First, each manager is initialized. Second, each manager's
Dispatcher struct is populated with references to the other managers.

| Package Name  | Has Manager | Handles Requests | Description
| ------------- | ----------- | ---------------- | -----------
| bestscore     | No          | No               | The struct for a variant's best score
| bitmask       | No          | No               | The struct for a bitmask data structure
| characters    | No          | No               | Handles access to data for Detrimental Characters
| chat          | Yes         | Yes              | Handles chat, chat commands, and friends
| commands      | Yes         | Yes              | Handles incoming commands (e.g. messages) from users
| constants     | No          | No               | Contains shared constants
| core          | Yes         | No               | Handles functionality like seeing the server uptime and shutting down
| discord       | Yes         | No               | Handles sending and receiving messages from Discord
| dispatcher    | No          | No               | An abstraction for dependency injection (to prevent circular imports)
| github        | Yes         | No               | Handles interfacing with GitHub.com
| httplocalhost | Yes         | No               | Handles a localhost HTTP server for administrative tasks
| httpmain      | Yes         | No               | Handles the main HTTP server (using the Gin framework)
| logger        | No          | No               | Handles logging (using the Zap framework)
| maintenance   | No          | No               | Shows a splash screen during periods of maintenance
| models        | No          | No               | Handles accessing the database
| options       | No          | No               | The struct for the options that a game can have
| sentry        | No          | No               | Handles interfacing with with Sentry service (for error reporting)
| sessions      | Yes         | Yes              | Handles sending and receiving messages from WebSocket connections
| settings      | No          | No               | The struct for the settings that a user can configure
| table         | Yes         | Yes              | Handles a single table
| tables        | Yes         | Yes              | Handles all tables (e.g. creating a new table, deleting a table, etc.)
| types         | No          | No               | Defines structs that the dispatcher needs to know about
| util          | No          | No               | Shared utility functions
| variants      | No          | No               | Handles access to data for different variants

List of blocking request:
- TODO

*/
package main
