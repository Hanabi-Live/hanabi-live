package main

import (
	"encoding/json"
	"io/ioutil"
	"path"
)

type Color struct {
	Name         string
	Abbreviation string
}

var (
	colors map[string]*Color
)

func colorsInit() {
	// Import the JSON file
	filePath := path.Join(dataPath, "colors.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	if err := json.Unmarshal(contents, &colors); err != nil {
		logger.Fatal("Failed to convert the colors file to JSON:", err)
		return
	}

	uniqueNameMap := make(map[string]struct{})
	for name, color := range colors {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			logger.Fatal("There are two colors with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = struct{}{}

		// Validate that there is an abbreviation
		if color.Abbreviation == "" {
			// Assume that it is the first letter of the color
			color.Abbreviation = string([]rune(name)[0])
		}
	}
}
