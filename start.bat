@echo off
cd /d "%~dp0"

REM Controlla se Node.js è installato
where node >nul 2>nul
if %errorlevel% neq 0 (
    cls
    echo  ============================================
    echo     GeoGestioneSpese — ERRORE
    echo  ============================================
    echo.
    echo  Node.js non trovato!
    echo.
    echo  Scaricalo da: https://nodejs.org
    echo  Dopo l'installazione riavvia questo file.
    echo.
    echo  ============================================
    pause
    exit /b 1
)

REM Avvia il server in finestra minimizzata
start /min "GeoGestioneSpese" node server.js

REM Aspetta un attimo che il server parta
timeout /t 2 /nobreak >nul

REM Apri il browser
start "" http://localhost:3000

REM Chiude questa finestra DOS
exit
