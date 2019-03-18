# Imports
import json
import os
import re
import requests
import sys

# Configuration
emotes_file = 'betterttv.txt' # Copy-pasted from the source code of: https://api.betterttv.net/emotes
directory = 'betterttv'

if not os.path.exists(directory):
    os.makedirs(directory)

with open(emotes_file, 'r') as f:
    data = f.read()
loaded_json = json.loads(data)

for emote in loaded_json["emotes"]:
    # Parse the JSON
    # e.g. {"url":"//cdn.betterttv.net/emote/54fa925e01e468494b85b54d/1x","width":28,"height":28,"imageType":"png","regex":"OhMyGoodness","channel":null}
    url = 'https:' + emote["url"]
    name = emote["regex"]

    # Skip animated gif emotes
    if emote["imageType"] != "png":
        continue

    # Skip emotes with colons in the name, since file names cannot have colons in them
    if ":" in name:
        continue

    # Download the emote
    r = requests.get(url, allow_redirects=True)
    path = os.path.join(directory, name + '.png')
    open(path, 'wb').write(r.content)
