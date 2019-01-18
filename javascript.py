#!/usr/bin/env python

# Imports
import os

# Get the directory of the script
# https://stackoverflow.com/questions/4934806/how-can-i-find-scripts-directory-with-python
DIR = os.path.dirname(os.path.realpath(__file__))

# We must change the directory to where the JavaScript tools are installed
JS_DIR = os.path.join(DIR, 'public', 'js')
os.chdir(JS_DIR)

# "Browserify" the JavaScript (to convert Node-style imports to compatible browser code)
MAIN_SRC_JS = os.path.join(JS_DIR, 'src', 'main.js')
MAIN_BUNDLED_JS = os.path.join(JS_DIR, 'main.bundled.js')
os.system('npx browserify "' + MAIN_SRC_JS + '" --outfile "' + MAIN_BUNDLED_JS + '" --verbose --debug')

# Combine all of the JavaScript into one file
JS_LIB_FILES = [
    'jquery-3.3.1.min.js', # jQuery
    'skel.min.js', # Skel
    'alpha.js', # HTML5 Up Alpha Template
    'tooltipster.bundle.min.js', # Tooltipster
    'tooltipster-scrollableTip.min.js', # Tooltipster
    'kinetic-v5.1.1.min.js', # KineticJS
    'sha256.min.js', # SHA256 (for password hashing)
]
JS_FILES = [
    'constants.js', # Hanabi Live code
    'main.bundled.js', # Hanabi Live code
]
JS_LIB_DIR = os.path.join(JS_DIR, 'lib')

js = ''
for file_name in JS_LIB_FILES:
    file_path = os.path.join(JS_LIB_DIR, file_name)
    with open(file_path, 'r', encoding='utf8') as f:
        js += f.read()
for file_name in JS_FILES:
    file_path = os.path.join(JS_DIR, file_name)
    with open(file_path, 'r', encoding='utf8') as f:
        js += f.read()

# Write it out to a temporary file
JS_CONCATENATED = os.path.join(JS_DIR, 'main.js')
with open(JS_CONCATENATED, 'w', encoding='utf8') as f:
    f.write(js)

# Minify JS
os.system('npx google-closure-compiler --js=main.js --js_output_file=main.min.js')
# (if we use the full paths here, it throws errors on Windows)
