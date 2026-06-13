@echo off
title Iniciar POS - Impresion Silenciosa
echo =======================================================
echo Cerrando instancias de Chrome abiertas...
echo =======================================================
taskkill /f /im chrome.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo.
echo =======================================================
echo Iniciando Chrome con Impresion Silenciosa (--kiosk-printing)...
echo =======================================================
start chrome --kiosk-printing http://localhost:5173
echo POS iniciado correctamente.
timeout /t 3 /nobreak >nul
