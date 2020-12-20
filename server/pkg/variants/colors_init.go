package variants

import (
	"encoding/json"
	"io/ioutil"
	"path"
)

func (m *Manager) ColorsInit(dataPath string) {
	// Import the JSON file
	filePath := path.Join(dataPath, "colors.json")
	var fileContents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		m.logger.Fatalf("Failed to read the \"%v\" file: %v", filePath, err)
	} else {
		fileContents = v
	}
	var colorsArray []*Color
	if err := json.Unmarshal(fileContents, &colorsArray); err != nil {
		m.logger.Fatalf("Failed to convert the colors file to JSON: %v", err)
	}

	// Convert the array to a map
	for _, color := range colorsArray {
		// Validate the name
		if color.Name == "" {
			m.logger.Fatal("There is a color with an empty name in the \"colors.json\" file.")
		}

		// Validate that there is an abbreviation
		if color.Abbreviation == "" {
			// Assume that it is the first letter of the color
			color.Abbreviation = string([]rune(color.Name)[0])
		} else if len(color.Abbreviation) != 1 {
			m.logger.Fatalf(
				"The \"%v\" color has an abbreviation that is not one letter long.",
				color.Name,
			)
		}

		// Validate the fill
		if color.Fill == "" {
			m.logger.Fatalf("The \"%v\" color has an empty fill.", color.Name)
		}

		// Validate that all of the names are unique
		if _, ok := m.colors[color.Name]; ok {
			m.logger.Fatalf("There are two colors with the name of: %v", color.Name)
		}

		// Add it to the map
		m.colors[color.Name] = color
	}
}
