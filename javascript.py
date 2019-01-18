#!/usr/bin/env python

# Imports
import os

# Get the directory of the script
# https://stackoverflow.com/questions/4934806/how-can-i-find-scripts-directory-with-python
DIR = os.path.dirname(os.path.realpath(__file__))

# Combine all of the CSS into one file
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
JS_LIB_DIR = os.path.join(DIR, 'public', 'js', 'lib')
JS_DIR = os.path.join(DIR, 'public', 'js')

js = ''
for file_name in JS_LIB_FILES:
    file_path = os.path.join(JS_LIB_DIR, file_name)
    with open(file_path, 'r', encoding='utf-8') as f:
        js += f.read()
for file_name in JS_FILES:
    file_path = os.path.join(JS_DIR, file_name)
    with open(file_path, 'r', encoding='utf-8') as f:
        js += f.read()

# Write it out to a temporary file
output_path = os.path.join(JS_DIR, 'main.js')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(js)

# Minify JS
output_path2 = os.path.join(JS_DIR, 'main.min.js')
os.chdir(JS_DIR) # The compiler is installed via npm to the "$DIR/public/js" directory
os.system('npx google-closure-compiler --js=main.js --js_output_file=main.min.js')
# (there is no need to use the full paths here; if we do, it throws errors on Windows)
