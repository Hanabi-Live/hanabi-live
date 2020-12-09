package httpmain

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/sessions"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

var (
	// From the parent function
	hLogger          *logger.Logger
	hModels          *models.Models
	hVariantsManager *variants.Manager
	hSessionsManager *sessions.Manager
	hProjectPath     string
	hVersionPath     string

	// Global variables used in Gin middleware
	domain       string
	useTLS       bool
	gaTrackingID string
	webpackPort  int
)

func Start(
	logger *logger.Logger,
	models *models.Models,
	variantsManager *variants.Manager,
	sessionsManager *sessions.Manager,
	projectPath string,
	versionPath string,
	isDev bool,
	usingSentry bool,
) {
	// Store references on global variables for convenience
	hLogger = logger
	hModels = models
	hVariantsManager = variantsManager
	hSessionsManager = sessionsManager
	hProjectPath = projectPath
	hVersionPath = versionPath

	// Get environment variables and store some of them as global variables
	// https://stackoverflow.com/questions/34046194
	var envVars *envVars
	if v, ok := readEnvVars(); !ok {
		return
	} else {
		envVars = v
	}
	domain = envVars.domain
	useTLS = len(envVars.tlsCertFile) > 0 && len(envVars.tlsKeyFile) > 0
	gaTrackingID = envVars.gaTrackingID
	webpackPort = envVars.webpackPort

	// Create a new Gin HTTP router
	httpRouter := gin.Default()                        // Has the "Logger" and "Recovery" middleware attached
	httpRouter.Use(gzip.Gzip(gzip.DefaultCompression)) // Add GZip compression middleware

	attachMiddleware(httpRouter, envVars, isDev, usingSentry)
	attachPathHandlers(httpRouter)

	if useTLS {
		createLetsEncryptDirs()

		// ListenAndServe is blocking, so we need to start listening in a new goroutine
		go httpRedirectToHTTPS()
	}

	// Listen on all IP addresses
	addr := fmt.Sprintf("0.0.0.0:%v", envVars.port)

	// Create an HTTP server
	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	HTTPServerWithTimeout := &http.Server{ // nolint: exhaustivestruct
		Addr:         addr,
		Handler:      httpRouter,
		ReadTimeout:  constants.HTTPReadTimeout,
		WriteTimeout: constants.HTTPWriteTimeout,
	}

	// Start listening and serving requests (which is blocking)
	hLogger.Infof("Listening on port: %v", envVars.port)
	if useTLS {
		if err := HTTPServerWithTimeout.ListenAndServeTLS(
			envVars.tlsCertFile,
			envVars.tlsKeyFile,
		); err != nil {
			hLogger.Fatalf("ListenAndServeTLS failed: %v", err)
		}
		hLogger.Fatal("ListenAndServeTLS ended prematurely.")
	} else {
		if err := HTTPServerWithTimeout.ListenAndServe(); err != nil {
			hLogger.Fatalf("ListenAndServe failed: %v", err)
		}
		hLogger.Fatal("ListenAndServe ended prematurely.")
	}
}

type envVars struct {
	domain        string
	sessionSecret string
	port          int
	tlsCertFile   string
	tlsKeyFile    string
	gaTrackingID  string
	webpackPort   int
}

// readEnvVars reads some specific environment variables relating to HTTP configuration
// (they were loaded from the ".env" file in "main.go")
func readEnvVars() (*envVars, bool) {
	domain := os.Getenv("DOMAIN")
	if len(domain) == 0 {
		hLogger.Info("The \"DOMAIN\" environment variable is blank; aborting HTTP initialization.")
		return nil, false
	}

	sessionSecret := os.Getenv("SESSION_SECRET")
	if len(sessionSecret) == 0 {
		hLogger.Info("The \"SESSION_SECRET\" environment variable is blank; aborting HTTP initialization.")
		return nil, false
	}

	portString := os.Getenv("PORT")
	var port int
	if len(portString) == 0 {
		port = 80
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			hLogger.Fatalf(
				"Failed to convert the \"PORT\" environment variable of \"%v\" to an integer: %v",
				portString,
				err,
			)
		} else {
			port = v
		}
	}

	tlsCertFile := os.Getenv("TLS_CERT_FILE")
	tlsKeyFile := os.Getenv("TLS_KEY_FILE")
	if len(tlsCertFile) == 0 && len(tlsKeyFile) != 0 {
		hLogger.Fatal("You have an environment variable set for \"TLS_CERT_FILE\" but nothing set for \"TLS_KEY_FILE\". Both of these environment variables must be set in order for HTTPS to work properly.")
	}
	if len(tlsCertFile) != 0 && len(tlsKeyFile) == 0 {
		hLogger.Fatal("You have an environment variable set for \"TLS_KEY_FILE\" but nothing set for \"TLS_CERT_FILE\". Both of these environment variables must be set in order for HTTPS to work properly.")
	}
	if len(tlsCertFile) != 0 && len(tlsKeyFile) != 0 {
		if port == 80 {
			port = 443
		}
	}

	gaTrackingID := os.Getenv("GA_TRACKING_ID")

	webpackPortString := os.Getenv("WEBPACK_DEV_SERVER_PORT")
	var webpackPort int
	if len(webpackPortString) == 0 {
		webpackPort = 8080
	} else {
		if v, err := strconv.Atoi(webpackPortString); err != nil {
			hLogger.Fatalf(
				"Failed to convert the \"WEBPACK_DEV_SERVER_PORT\" environment variable of \"%v\" to an integer: %v",
				webpackPortString,
				err,
			)
		} else {
			webpackPort = v
		}
	}

	envVars := &envVars{
		domain:        domain,
		sessionSecret: sessionSecret,
		port:          port,
		tlsCertFile:   tlsCertFile,
		tlsKeyFile:    tlsKeyFile,
		gaTrackingID:  gaTrackingID,
		webpackPort:   webpackPort,
	}
	return envVars, true
}

func attachPathHandlers(httpRouter *gin.Engine) {
	// Path handlers (for cookies and logging in)
	httpRouter.POST("/login", login)
	httpRouter.GET("/logout", logout)
	httpRouter.GET("/test-cookie", testCookie)
	httpRouter.GET("/ws", ws)

	// Path handlers (for the main website)
	httpRouter.GET("/", main)
	httpRouter.GET("/lobby", main)
	httpRouter.GET("/pre-game", main)
	httpRouter.GET("/pre-game/:tableID", main)
	httpRouter.GET("/game", main)
	httpRouter.GET("/game/:tableID", main)
	httpRouter.GET("/replay", main)
	httpRouter.GET("/replay/:databaseID", main)
	httpRouter.GET("/replay/:databaseID/:turnID", main) // Deprecated; needed for older links to work
	httpRouter.GET("/shared-replay", main)
	httpRouter.GET("/shared-replay/:databaseID", main)
	httpRouter.GET("/shared-replay/:databaseID/:turnID", main) // Deprecated; needed for older links to work
	httpRouter.GET("/create-table", main)

	// Path handlers for other URLs
	httpRouter.GET("/scores", scores)
	httpRouter.GET("/scores/:player1", scores)
	httpRouter.GET("/profile", scores) // "/profile" is an alias for "/scores"
	httpRouter.GET("/profile/:player1", scores)
	httpRouter.GET("/history", history)
	httpRouter.GET("/history/:player1", history)
	httpRouter.GET("/history/:player1/:player2", history)
	httpRouter.GET("/history/:player1/:player2/:player3", history)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4", history)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4/:player5", history)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4/:player5/:player6", history)
	httpRouter.GET("/missing-scores", missingScores)
	httpRouter.GET("/missing-scores/:player1", missingScores)
	httpRouter.GET("/missing-scores/:player1/:numPlayers", missingScores)
	httpRouter.GET("/shared-missing-scores", sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1", sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2", sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3", sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4", sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4/:player5", sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4/:player5/:player6", sharedMissingScores)
	httpRouter.GET("/tag", tag)
	httpRouter.GET("/tag/:tag", tag)
	httpRouter.GET("/tags", tags)
	httpRouter.GET("/tags/:player1", tags)
	httpRouter.GET("/seed", seed)
	httpRouter.GET("/seed/:seed", seed) // Display all games played on a given seed
	httpRouter.GET("/stats", stats)
	httpRouter.GET("/variant", variant)
	httpRouter.GET("/variant/:id", variant)
	httpRouter.GET("/videos", videos)
	httpRouter.GET("/password-reset", passwordReset)
	httpRouter.POST("/password-reset", passwordResetPost)

	// Path handlers for bots, developers, researchers, etc.
	httpRouter.GET("/export", export)
	httpRouter.GET("/export/:databaseID", export)

	// Other
	httpRouter.Static("/public", path.Join(hProjectPath, "public"))
	httpRouter.StaticFile("/favicon.ico", path.Join(hProjectPath, "public", "img", "favicon.ico"))
}

func createLetsEncryptDirs() {
	// Create the LetsEncrypt directory structure
	// (CertBot will look for data in "/.well-known/acme-challenge/####")
	letsEncryptPath := path.Join(hProjectPath, "letsencrypt")
	if _, err := os.Stat(letsEncryptPath); os.IsNotExist(err) {
		if err := os.MkdirAll(letsEncryptPath, 0755); err != nil {
			hLogger.Fatalf(
				"Failed to create the \"%v\" directory: %v",
				letsEncryptPath,
				err,
			)
		}
	}

	wellKnownPath := path.Join(letsEncryptPath, ".well-known")
	if _, err := os.Stat(wellKnownPath); os.IsNotExist(err) {
		if err := os.MkdirAll(wellKnownPath, 0755); err != nil {
			hLogger.Fatalf("Failed to create the \"%v\" directory: %v", wellKnownPath, err)
		}
	}

	acmeChallengePath := path.Join(wellKnownPath, "acme-challenge")
	if _, err := os.Stat(acmeChallengePath); os.IsNotExist(err) {
		if err := os.MkdirAll(acmeChallengePath, 0755); err != nil {
			hLogger.Fatalf(
				"Failed to create the \"%v\" directory: %v",
				acmeChallengePath,
				err,
			)
		}
	}
}

// httpRedirectToHTTPS is meant to be run in a new goroutine
func httpRedirectToHTTPS() {
	// We want all HTTP requests to be redirected to HTTPS
	// (but make an exception for Let's Encrypt)
	// The Gin router is using the default serve mux,
	// so we need to create a new fresh one for the HTTP handler
	letsEncryptPath := path.Join(hProjectPath, "letsencrypt")
	HTTPServeMux := http.NewServeMux()
	HTTPServeMux.Handle(
		"/.well-known/acme-challenge/",
		http.FileServer(http.FileSystem(http.Dir(letsEncryptPath))),
	)
	HTTPServeMux.Handle(
		"/",
		http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			http.Redirect(
				w,
				req,
				"https://"+req.Host+req.URL.String(),
				http.StatusMovedPermanently,
			)
		}),
	)

	// We need to create a new http.Server because the default one has no timeouts
	// https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
	HTTPRedirectServerWithTimeout := &http.Server{ // nolint: exhaustivestruct
		Addr:         "0.0.0.0:80", // Listen on all IP addresses
		Handler:      HTTPServeMux,
		ReadTimeout:  constants.HTTPReadTimeout,
		WriteTimeout: constants.HTTPWriteTimeout,
	}
	if err := HTTPRedirectServerWithTimeout.ListenAndServe(); err != nil {
		hLogger.Fatalf("ListenAndServe failed to start on port 80: %v", err)
	}
	hLogger.Fatal("ListenAndServe ended for port 80.")
}
