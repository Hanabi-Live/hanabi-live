// getVersion will get the current version of the JavaScript client,
// which is contained in the "version.txt" file
// We want to read this file every time (as opposed to just reading it on server start) so that we
// can update the client without having to restart the entire server
func getVersion() int {
	var fileContents []byte
	if v, err := os.ReadFile(versionPath); err != nil {
		logger.Error("Failed to read the \"" + versionPath + "\" file: " + err.Error())
		return 0
	} else {
		fileContents = v
	}
	versionString := string(fileContents)
	versionString = strings.TrimSpace(versionString)
	if v, err := strconv.Atoi(versionString); err != nil {
		logger.Error("Failed to convert \"" + versionString + "\" " +
			"(the contents of the version file) to a number: " + err.Error())
		return 0
	} else {
		return v
	}
}
