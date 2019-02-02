#!/usr/bin/env python

# Imports
import os
import subprocess
import sys

# Get the directory of the script
# https://stackoverflow.com/questions/4934806/how-can-i-find-scripts-directory-with-python
DIR = os.path.dirname(os.path.realpath(__file__))

# "Browserify" the JavaScript (to convert Node-style imports to compatible browser code)
JS_DIR = os.path.join(DIR, 'public', 'js')
MAIN_SRC_JS = os.path.join(JS_DIR, 'src', 'main.js')
MAIN_BUNDLED_JS = os.path.join(JS_DIR, 'main.bundled.js')
if not os.path.isfile(MAIN_SRC_JS):
    print('Error: Failed to find file "' + MAIN_SRC_JS + '".')
try:
   output = subprocess.check_output([
       'npx',
       'browserify',
       MAIN_SRC_JS,
       '--outfile',
       MAIN_BUNDLED_JS,
   ], cwd=JS_DIR)
   output = output.strip()
   if output != '':
       print(output)
except subprocess.CalledProcessError as e:
    print('Error: Failed to browserify the JavaScript.')
    sys.exit(1)
print("Browserification complete.")

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
    'main.bundled.js', # Hanabi Live code
]
JS_LIB_DIR = os.path.join(JS_DIR, 'lib')

js = ''
for file_name in JS_LIB_FILES:
    file_path = os.path.join(JS_LIB_DIR, file_name)
    if not os.path.isfile(file_path):
        print('Error: Failed to find file "' + file_path + '".')
        sys.exit(1)
    if sys.version_info >= (3, 0):
        with open(file_path, 'r', encoding='utf8') as f:
            js += f.read()
    else:
        with open(file_path, 'r') as f:
            js += f.read()

for file_name in JS_FILES:
    file_path = os.path.join(JS_DIR, file_name)
    if not os.path.isfile(file_path):
        print('Error: Failed to find file "' + file_path + '".')
        sys.exit(1)
    if sys.version_info >= (3, 0):
        with open(file_path, 'r', encoding='utf8') as f:
            js += f.read()
    else:
        with open(file_path, 'r') as f:
            js += f.read()

# Write it out to a temporary file
JS_CONCATENATED = os.path.join(JS_DIR, 'main.js')
if sys.version_info >= (3, 0):
    with open(JS_CONCATENATED, 'w', encoding='utf8') as f:
        f.write(js)
else:
    with open(JS_CONCATENATED, 'w') as f:
        f.write(js)

# Compile and minify JS
try:
    output = subprocess.check_output([
        'npx',
        'google-closure-compiler',
        '--js',
        'main.js',
        '--js_output_file',
        'main.min.js',
        '--warning_level',
        'QUIET',
    ], cwd=JS_DIR)
    output = output.strip()
    if output != '':
        print(output)
except subprocess.CalledProcessError as e:
    print('Error: Failed to compile the JavaScript.')
    sys.exit(1)
print("Closure compilation complete.")
