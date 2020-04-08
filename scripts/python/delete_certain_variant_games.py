#!/usr/bin/env python3
# (the "dotenv" module does not work in Python 2)

import sys
if sys.version_info < (3, 0):
    print('This script requires Python 3.x.')
    sys.exit(1)

# Imports
import json
import os
import dotenv
import mysql.connector

# Configuration
debug = False

# Import environment variables
dotenv.load_dotenv(dotenv.find_dotenv())

# Variables
user = os.getenv('DB_USER')
password = os.getenv('DB_PASS')
host = os.getenv('DB_HOST')
if host == '':
    host = 'localhost'
database = os.getenv('DB_NAME')

# Connect to the MySQL database
cnx = mysql.connector.connect(
    user=user,
    password=password,
    host=host,
    database=database
)

# Open the "variants.json" file
variants_path = os.path.join('..', '..', 'public', 'js', 'src', 'data', 'variants.json')
with open(variants_path) as f:
    variants = json.load(f)
variant_ids = []
for variantName in variants:
    variant = variants[variantName]
    if '-Ones' in variantName or '-Fives' in variantName:
        variant_ids.append(variant['id'])

for variant_id in variant_ids:
    cursor = cnx.cursor()
    query = ('DELETE FROM games WHERE variant = %s AND datetime_started > 2020-04-05;')
    cursor.execute(query, (variant_id,))
    cursor.close()

cnx.commit()
cnx.close()
