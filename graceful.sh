#!/bin/bash

# Graceful shutdown is mapped to SIGUSR1
pkill -SIGUSR1 hanabi-live
