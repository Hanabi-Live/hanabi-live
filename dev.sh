# From: https://spin.atomicobject.com/2017/08/24/start-stop-bash-background-process/
# Start both server and webpack
# Stop both with Ctrl + c
trap "kill 0" EXIT

./run.sh &
./webpack-dev-server.sh &

wait
