package httpmain

import (
	"net/http"
	"os"
	"path"
	"strings"
	"text/template"
	"time"
)

type TemplateData struct {
	// Shared
	WebsiteName string
	Title       string // Used to populate the "<title>" tag
	Domain      string // Used to validate that the user is going to the correct URL
	Version     int
	Compiling   bool // True if we are currently recompiling the TypeScript client
	WebpackPort int

	// Profile
	Name       string
	NamesTitle string

	// History
	History      []*GameHistory
	SpecificSeed bool
	Tags         map[int][]string

	// Scores
	DateJoined                 string
	NumGames                   int
	TimePlayed                 string
	NumGamesSpeedrun           int
	TimePlayedSpeedrun         string
	NumMaxScores               int
	TotalMaxScores             int
	PercentageMaxScores        string
	RequestedNumPlayers        int      // Used on the "Missing Scores" page
	NumMaxScoresPerType        []int    // Used on the "Missing Scores" page
	PercentageMaxScoresPerType []string // Used on the "Missing Scores" page
	SharedMissingScores        bool     // Used on the "Missing Scores" page
	VariantStats               []*UserVariantStats

	// Stats
	NumVariants int
	Variants    []*VariantStatsData

	// Variants
	BestScores    []int
	MaxScoreRate  string
	MaxScore      int
	AverageScore  string
	NumStrikeouts int
	StrikeoutRate string
	RecentGames   []*GameHistory
}

// serveTemplate combines a standard HTML header with the body for a specific page
// (we want the same HTML header for all pages)
func serveTemplate(w http.ResponseWriter, data *TemplateData, templateName ...string) {
	// Since we are using the GZip middleware, we have to specify the content type,
	// or else the page will be downloaded by the browser as "download.gz"
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	viewsPath := path.Join(projectPath, "server", "src", "views")
	layoutPath := path.Join(viewsPath, "layout.tmpl")
	logoPath := path.Join(viewsPath, "logo.tmpl")

	// Turn the slice of file names into a slice of full paths
	for i := 0; i < len(templateName); i++ {
		templateName[i] = path.Join(viewsPath, templateName[i]+".tmpl")
	}

	// Ensure that the layout file exists
	if _, err := os.Stat(layoutPath); os.IsNotExist(err) {
		hLog.Error("The layout template does not exist.")
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// Return a 404 if the template doesn't exist or it is a directory
	if info, err := os.Stat(layoutPath); os.IsNotExist(err) {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	} else if info.IsDir() {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	// Append the main layout to our list of layouts
	templateName = append(templateName, layoutPath)

	// Append the nav bar logo to our list of layouts
	templateName = append(templateName, logoPath)

	// Create the template
	var tmpl *template.Template
	if v, err := template.New("template").Funcs(template.FuncMap{
		"formatDate": formatDate,
	}).ParseFiles(templateName...); err != nil {
		hLog.Errorf("Failed to create the template: %v", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		tmpl = v
	}

	// Add extra data that should be the same for every page request
	data.WebsiteName = WebsiteName
	data.Version = getVersion()

	// Execute the template and send it to the user
	if err := tmpl.ExecuteTemplate(w, "layout", data); err != nil {
		if isCommonHTTPError(err.Error()) {
			hLog.Infof("Ordinary error when executing the template: %v", err)
		} else {
			hLog.Errorf("Failed to execute the template: %v", err)
		}
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
	}
}

func formatDate(date time.Time) string {
	return date.Format("2006-01-02 &mdash; 15:04:05 MST")
}

// isCommonHTTPError checks for some errors that are common and expected
// (e.g. the user presses the "Stop" button while the template is executing)
func isCommonHTTPError(errorMsg string) bool {
	for _, commonHTTPError := range commonHTTPErrors {
		if strings.HasSuffix(errorMsg, commonHTTPError) {
			return true
		}
	}

	return false
}
