#!/bin/sh
# Prioridad baja: que MySQL y la API de Krono tengan CPU primero
exec nice -n 10 node backend/headless-main.js
