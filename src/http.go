package main

import (
	"net/http"
	"os"
	"strconv"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const (
	sessionName = "hanabi.sid"
)

var (
	sessionStore sessions.CookieStore
)

func httpInit() {
	// Create a new Gin HTTP router
	gin.SetMode(gin.ReleaseMode) // Comment this out to debug HTTP stuff
	httpRouter := gin.Default()

	// Read some HTTP server configuration values from environment variables
	// (they were loaded from the .env file in main.go)
	sessionSecret := os.Getenv("SESSION_SECRET")
	if len(sessionSecret) == 0 {
		log.Info("The \"SESSION_SECRET\" environment variable is blank; aborting HTTP initalization.")
		return
	}
	domain := os.Getenv("DOMAIN")
	if len(domain) == 0 {
		log.Info("The \"DOMAIN\" environment variable is blank; aborting HTTP initalization.")
		return
	}
	tlsCertFile := os.Getenv("TLS_CERT_FILE")
	tlsKeyFile := os.Getenv("TLS_KEY_FILE")
	useTLS := true
	if len(tlsCertFile) == 0 || len(tlsKeyFile) == 0 {
		useTLS = false
	}

	// Create a session store
	sessionStore = sessions.NewCookieStore([]byte(sessionSecret))
	options := sessions.Options{
		Path:   "/",
		Domain: domain,
		MaxAge: 5, // 5 seconds
		// After getting a cookie via "/login", the client will immediately
		// establish a WebSocket connection via "/ws", so the cookie only needs
		// to exist for that time frame
		Secure: true,
		// Only send the cookie over HTTPS:
		// https://www.owasp.org/index.php/Testing_for_cookies_attributes_(OTG-SESS-002)
		HttpOnly: true,
		// Mitigate XSS attacks:
		// https://www.owasp.org/index.php/HttpOnly
	}
	if !useTLS {
		options.Secure = false
	}
	sessionStore.Options(options)
	httpRouter.Use(sessions.Sessions(sessionName, sessionStore))

	// Path handlers (for the WebSocket server)
	httpRouter.POST("/login", httpLogin)
	httpRouter.GET("/ws", httpWS)

	// Path handlers (for the website)
	httpRouter.GET("/", httpHome)
	httpRouter.Static("/public", "../public")

	// Figure out the port that we are using for the HTTP server
	var port int
	if useTLS {
		// We want all HTTP requests to be redirected to HTTPS
		// (but make an exception for Let's Encrypt)
		// The Gin router is using the default serve mux, so we need to create a
		// new fresh one for the HTTP handler
		HTTPServeMux := http.NewServeMux()
		HTTPServeMux.Handle("/.well-known/acme-challenge/", http.FileServer(http.FileSystem(http.Dir("../letsencrypt"))))
		HTTPServeMux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			http.Redirect(w, req, "https://"+req.Host+req.URL.String(), http.StatusMovedPermanently)
		}))

		// ListenAndServe is blocking, so start listening on a new goroutine
		go func() {
			http.ListenAndServe(":80", HTTPServeMux) // Nothing before the colon implies 0.0.0.0
			log.Fatal("http.ListenAndServe ended for port 80.", nil)
		}()

		// 443 is the default port for HTTPS
		port = 443
	} else {
		// 80 is the defeault port for HTTP
		port = 80
	}

	// Start listening and serving requests (which is blocking)
	log.Info("Listening on port " + strconv.Itoa(port) + ".")
	if useTLS {
		if err := http.ListenAndServeTLS(
			":"+strconv.Itoa(port), // Nothing before the colon implies 0.0.0.0
			tlsCertFile,
			tlsKeyFile,
			httpRouter,
		); err != nil {
			log.Fatal("http.ListenAndServeTLS failed:", err)
		}
		log.Fatal("http.ListenAndServeTLS ended prematurely.", nil)
	} else {
		// Listen and serve (HTTP)
		if err := http.ListenAndServe(
			":"+strconv.Itoa(port), // Nothing before the colon implies 0.0.0.0
			httpRouter,
		); err != nil {
			log.Fatal("http.ListenAndServe failed:", err)
		}
		log.Fatal("http.ListenAndServe ended prematurely.", nil)
	}
}
