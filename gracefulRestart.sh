#!/bin/bash

# Graceful restart is mapped to SIGUSR1
pkill -SIGUSR1 hanabi-live
