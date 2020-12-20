package httpmain

import (
	"net/http"
	"os"
	"path"
	"text/template"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/sentry"
)

// commonData contains fields that should be injected into every template.
// Note that all fields must be exported in template data structs,
// otherwise templates cannot use them.
type commonData struct {
	WebsiteName string
	Version     int
}

// getCommonData adds extra data that should be the same for every template / page request.
func (m *Manager) getCommonData() *commonData {
	return &commonData{
		WebsiteName: constants.WebsiteName,
		Version:     m.getVersion(),
	}
}

// serveTemplate combines a standard HTML header with the body for a specific page.
// (We want the same HTML header for all pages.)
func (m *Manager) serveTemplate(w http.ResponseWriter, data interface{}, templateName ...string) {
	// Since we are using the GZip middleware, we have to specify the content type,
	// or else the page will be downloaded by the browser as "download.gz"
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	viewsPath := path.Join(m.projectPath, "server", "src", "views")
	layoutPath := path.Join(viewsPath, "layout.tmpl")
	logoPath := path.Join(viewsPath, "logo.tmpl")

	// Turn the slice of file names into a slice of full paths
	for i := 0; i < len(templateName); i++ {
		templateName[i] = path.Join(viewsPath, templateName[i]+".tmpl")
	}

	// Ensure that the layout file exists
	if _, err := os.Stat(layoutPath); os.IsNotExist(err) {
		m.logger.Error("The layout template does not exist.")
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
		"formatDatetime": formatDatetime,
	}).ParseFiles(templateName...); err != nil {
		m.logger.Errorf("Failed to create the template: %v", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		tmpl = v
	}

	// Execute the template and send it to the user
	if err := tmpl.ExecuteTemplate(w, "layout", data); err != nil {
		if sentry.IsCommonHTTPError(err.Error()) {
			m.logger.Infof("Ordinary error when executing the template: %v", err)
		} else {
			m.logger.Errorf("Failed to execute the template: %v", err)
		}
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
	}
}

func formatDatetime(date time.Time) string {
	return date.Format("2006-01-02 &mdash; 15:04:05 MST")
}
