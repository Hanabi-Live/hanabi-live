package main

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
)

func httpGetIntVariable(c *gin.Context, param string) (int, error) {
	paramString := c.Param(param)
	if v, err := strconv.Atoi(paramString); err != nil {
		return 0, errors.New("parameter is not an integer")
	} else {
		return v, nil
	}
}
