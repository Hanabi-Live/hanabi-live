package main

import (
	"encoding/json"
	"io/ioutil"
	"path"
)

var (
	colors map[string]*Color
)

func colorsInit() {
	// Import the JSON file
	filePath := path.Join(dataPath, "colors.json")
	var fileContents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		fileContents = v
	}
	var colorsArray []*Color
	if err := json.Unmarshal(fileContents, &colorsArray); err != nil {
		logger.Fatal("Failed to convert the colors file to JSON:", err)
		return
	}

	// Convert the array to a map
	colors = make(map[string]*Color)
	for _, color := range colorsArray {
		// Validate the name
		if color.Name == "" {
			logger.Fatal("There is a color with an empty name in the \"colors.json\" file.")
			return
		}

		// Validate that there is an abbreviation
		if color.Abbreviation == "" {
			// Assume that it is the first letter of the color
			color.Abbreviation = string([]rune(color.Name)[0])
		} else if len(color.Abbreviation) != 1 {
			logger.Fatal("The \"" + color.Name + "\" color has an abbreviation that is not one letter long.")
			return
		}

		// Validate the fill
		if color.Fill == "" {
			logger.Fatal("The \"" + color.Name + "\" color has an empty fill.")
			return
		}

		// Validate that all of the names are unique
		if _, ok := colors[color.Name]; ok {
			logger.Fatal("There are two colors with the name of \"" + color.Name + "\".")
			return
		}

		// Add it to the map
		colors[color.Name] = color
	}
}
