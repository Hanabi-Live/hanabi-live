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

type Manager struct {
	Domain string
	UseTLS bool

	httpClientWithTimeout *http.Client // Used for the Google Analytics middleware

	logger          *logger.Logger
	models          *models.Models
	sessionsManager *sessions.Manager
	variantsManager *variants.Manager
	projectPath     string
	versionPath     string
	isDev           bool
	usingSentry     bool
	gaTrackingID    string
	webpackPort     int
}

func NewManager(
	logger *logger.Logger,
	models *models.Models,
	sessionsManager *sessions.Manager,
	variantsManager *variants.Manager,
	projectPath string,
	versionPath string,
	isDev bool,
	usingSentry bool,
) *Manager {
	// Get environment variables
	envVars := getEnvVars(logger)
	if envVars == nil {
		return nil
	}

	m := &Manager{
		Domain: envVars.domain,
		UseTLS: len(envVars.tlsCertFile) > 0 && len(envVars.tlsKeyFile) > 0,

		// We don't want to use the default http.Client because it has no default timeout set
		httpClientWithTimeout: &http.Client{ // nolint: exhaustivestruct
			Timeout: constants.HTTPWriteTimeout,
		},

		logger:          logger,
		models:          models,
		sessionsManager: sessionsManager,
		variantsManager: variantsManager,
		projectPath:     projectPath,
		versionPath:     versionPath,
		isDev:           isDev,
		usingSentry:     usingSentry,
		gaTrackingID:    envVars.gaTrackingID,
		webpackPort:     envVars.webpackPort,
	}
	go m.start(envVars)

	return m
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

// getEnvVars reads some specific environment variables relating to HTTP configuration.
// (They were loaded from the ".env" file in "main.go".)
func getEnvVars(logger *logger.Logger) *envVars {
	domain := os.Getenv("DOMAIN")
	if len(domain) == 0 {
		logger.Info("The \"DOMAIN\" environment variable is blank; aborting HTTP initialization.")
		return nil
	}

	sessionSecret := os.Getenv("SESSION_SECRET")
	if len(sessionSecret) == 0 {
		logger.Info("The \"SESSION_SECRET\" environment variable is blank; aborting HTTP initialization.")
		return nil
	}

	portString := os.Getenv("PORT")
	var port int
	if len(portString) == 0 {
		port = 80
	} else {
		if v, err := strconv.Atoi(portString); err != nil {
			logger.Fatalf(
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
		logger.Fatal("You have an environment variable set for \"TLS_CERT_FILE\" but nothing set for \"TLS_KEY_FILE\". Both of these environment variables must be set in order for HTTPS to work properly.")
	}
	if len(tlsCertFile) != 0 && len(tlsKeyFile) == 0 {
		logger.Fatal("You have an environment variable set for \"TLS_KEY_FILE\" but nothing set for \"TLS_CERT_FILE\". Both of these environment variables must be set in order for HTTPS to work properly.")
	}
	if len(tlsCertFile) != 0 && len(tlsKeyFile) != 0 {
		if port == defaultHTTPPort {
			port = defaultHTTPSPort
		}
	}

	gaTrackingID := os.Getenv("GA_TRACKING_ID")

	webpackPortString := os.Getenv("WEBPACK_DEV_SERVER_PORT")
	var webpackPort int
	if len(webpackPortString) == 0 {
		webpackPort = defaultWebpackPort
	} else {
		if v, err := strconv.Atoi(webpackPortString); err != nil {
			logger.Fatalf(
				"Failed to convert the \"WEBPACK_DEV_SERVER_PORT\" environment variable of \"%v\" to an integer: %v",
				webpackPortString,
				err,
			)
		} else {
			webpackPort = v
		}
	}

	return &envVars{
		domain:        domain,
		sessionSecret: sessionSecret,
		port:          port,
		tlsCertFile:   tlsCertFile,
		tlsKeyFile:    tlsKeyFile,
		gaTrackingID:  gaTrackingID,
		webpackPort:   webpackPort,
	}
}

// start launches the HTTP server.
// It is meant to be run in a new goroutine.
func (m *Manager) start(envVars *envVars) {
	// Create a new Gin HTTP router
	httpRouter := gin.Default()                        // Has the "Logger" and "Recovery" middleware attached
	httpRouter.Use(gzip.Gzip(gzip.DefaultCompression)) // Add GZip compression middleware

	attachMiddleware(httpRouter, m, envVars)
	attachPathHandlers(httpRouter, m)

	if m.UseTLS {
		m.createLetsEncryptDirs()

		// ListenAndServe is blocking, so we need to start listening in a new goroutine
		go m.httpRedirectToHTTPS()
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
	m.logger.Infof("Listening on port: %v", envVars.port)
	if m.UseTLS {
		if err := HTTPServerWithTimeout.ListenAndServeTLS(
			envVars.tlsCertFile,
			envVars.tlsKeyFile,
		); err != nil {
			m.logger.Fatalf("ListenAndServeTLS failed: %v", err)
		}
		m.logger.Fatal("ListenAndServeTLS ended prematurely.")
	} else {
		if err := HTTPServerWithTimeout.ListenAndServe(); err != nil {
			m.logger.Fatalf("ListenAndServe failed: %v", err)
		}
		m.logger.Fatal("ListenAndServe ended prematurely.")
	}
}

func attachPathHandlers(httpRouter *gin.Engine, m *Manager) {
	// Path handlers (for cookies and logging in)
	httpRouter.POST("/login", m.login)
	httpRouter.GET("/logout", m.logout)
	httpRouter.GET("/test-cookie", m.testCookie)
	httpRouter.GET("/ws", m.ws)

	// Path handlers (for the main website)
	httpRouter.GET("/", m.main)
	httpRouter.GET("/lobby", m.main)
	httpRouter.GET("/pre-game", m.main)
	httpRouter.GET("/pre-game/:tableID", m.main)
	httpRouter.GET("/game", m.main)
	httpRouter.GET("/game/:tableID", m.main)
	httpRouter.GET("/replay", m.main)
	httpRouter.GET("/replay/:databaseID", m.main)
	httpRouter.GET("/replay/:databaseID/:turnID", m.main) // Deprecated; needed for older links to work
	httpRouter.GET("/shared-replay", m.main)
	httpRouter.GET("/shared-replay/:databaseID", m.main)
	httpRouter.GET("/shared-replay/:databaseID/:turnID", m.main) // Deprecated; needed for older links to work
	httpRouter.GET("/create-table", m.main)

	// Path handlers for other URLs
	httpRouter.GET("/scores", m.scores)
	httpRouter.GET("/scores/:player1", m.scores)
	httpRouter.GET("/profile", m.scores) // "/profile" is an alias for "/scores"
	httpRouter.GET("/profile/:player1", m.scores)
	httpRouter.GET("/history", m.history)
	httpRouter.GET("/history/:player1", m.history)
	httpRouter.GET("/history/:player1/:player2", m.history)
	httpRouter.GET("/history/:player1/:player2/:player3", m.history)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4", m.history)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4/:player5", m.history)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4/:player5/:player6", m.history)
	httpRouter.GET("/missing-scores", m.missingScores)
	httpRouter.GET("/missing-scores/:player1", m.missingScores)
	httpRouter.GET("/missing-scores/:player1/:numPlayers", m.missingScores)
	httpRouter.GET("/shared-missing-scores", m.sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1", m.sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2", m.sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3", m.sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4", m.sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4/:player5", m.sharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:player1/:player2/:player3/:player4/:player5/:player6", m.sharedMissingScores)
	httpRouter.GET("/tag", m.tag)
	httpRouter.GET("/tag/:tag", m.tag)
	httpRouter.GET("/tags", m.tags)
	httpRouter.GET("/tags/:player1", m.tags)
	httpRouter.GET("/seed", m.seed)
	httpRouter.GET("/seed/:seed", m.seed) // Display all games played on a given seed
	httpRouter.GET("/stats", m.stats)
	httpRouter.GET("/variant", m.variant)
	httpRouter.GET("/variant/:id", m.variant)
	httpRouter.GET("/videos", m.videos)
	httpRouter.GET("/password-reset", m.passwordReset)
	httpRouter.POST("/password-reset", m.passwordResetPost)

	// Path handlers for bots, developers, researchers, etc.
	httpRouter.GET("/export", m.export)
	httpRouter.GET("/export/:databaseID", m.export)

	// Other
	httpRouter.Static("/public", path.Join(m.projectPath, "public"))
	httpRouter.StaticFile("/favicon.ico", path.Join(m.projectPath, "public", "img", "favicon.ico"))
}

func (m *Manager) createLetsEncryptDirs() {
	// Create the LetsEncrypt directory structure
	// (CertBot will look for data in "/.well-known/acme-challenge/####")
	letsEncryptPath := path.Join(m.projectPath, "letsencrypt")
	if _, err := os.Stat(letsEncryptPath); os.IsNotExist(err) {
		if err := os.MkdirAll(letsEncryptPath, 0755); err != nil {
			m.logger.Fatalf(
				"Failed to create the \"%v\" directory: %v",
				letsEncryptPath,
				err,
			)
		}
	}

	wellKnownPath := path.Join(letsEncryptPath, ".well-known")
	if _, err := os.Stat(wellKnownPath); os.IsNotExist(err) {
		if err := os.MkdirAll(wellKnownPath, 0755); err != nil {
			m.logger.Fatalf("Failed to create the \"%v\" directory: %v", wellKnownPath, err)
		}
	}

	acmeChallengePath := path.Join(wellKnownPath, "acme-challenge")
	if _, err := os.Stat(acmeChallengePath); os.IsNotExist(err) {
		if err := os.MkdirAll(acmeChallengePath, 0755); err != nil {
			m.logger.Fatalf(
				"Failed to create the \"%v\" directory: %v",
				acmeChallengePath,
				err,
			)
		}
	}
}

// httpRedirectToHTTPS is meant to be run in a new goroutine.
func (m *Manager) httpRedirectToHTTPS() {
	// We want all HTTP requests to be redirected to HTTPS
	// (but make an exception for Let's Encrypt)
	// The Gin router is using the default serve mux,
	// so we need to create a new fresh one for the HTTP handler
	letsEncryptPath := path.Join(m.projectPath, "letsencrypt")
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
		m.logger.Fatalf("ListenAndServe failed to start on port 80: %v", err)
	}
	m.logger.Fatal("ListenAndServe ended for port 80.")
}
