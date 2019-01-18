package main

import (
	"github.com/gin-gonic/gin"
)

type Flowchart struct {
	Name        string
	Description string
}

type FlowchartsData struct {
	Title      string
	Flowcharts []Flowchart
	Header     bool
}

type FlowchartData struct {
	Title     string
	Flowchart string
	Header    bool
}

//home page for all flowcharts, displays flowchart list
func httpFlowcharts(c *gin.Context) {
	w := c.Writer
	data := FlowchartsData{
		Title: "Flowcharts",
		Flowcharts: []Flowchart{
			{Name: "early5clue", Description: "Clues to 5's"},
		},
	}
	httpServeTemplate(w, data, "informational", "flowcharts")
}

//all other flowchart quizes are/will be represented here and require no templates vvvvvvvvv

func httpEarly5Clue(c *gin.Context) {
	w := c.Writer
	data := FlowchartData{
		Title:     "Early Game 5 Clues",
		Flowchart: "early5clue",
		Header:    true,
	}
	httpServeTemplate(w, data, "informational", "flowchart")
}
