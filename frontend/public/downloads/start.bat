@echo off
REM ============================================================
REM MKS Management System — 1-Click Start (Windows)
REM Runs backend (FastAPI) and frontend (React) in new cmd windows.
REM ============================================================

title MKS Launcher

cd /d "%~dp0"

echo.
echo ===============================================
echo   MKS Management System - LAUNCHER
echo ===============================================
echo.

REM --- Sanity check ---
if not exist "backend\server.py" (
  echo [ERROR] backend\server.py tidak ada. Pastikan Anda di folder root MKS.
  pause
  exit /b 1
)
if not exist "frontend\package.json" (
  echo [ERROR] frontend\package.json tidak ada. Pastikan Anda di folder root MKS.
  pause
  exit /b 1
)

REM --- Start Backend (new cmd window) ---
echo Starting BACKEND on port 8000...
start "MKS Backend" cmd /k "cd /d %CD%\backend && uvicorn server:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

REM --- Start Frontend (new cmd window) ---
echo Starting FRONTEND on port 3000...
start "MKS Frontend" cmd /k "cd /d %CD%\frontend && yarn start"

echo.
echo ===============================================
echo   APPLIKASI SEDANG START
echo ===============================================
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Untuk stop: tutup kedua cmd window "MKS Backend" dan "MKS Frontend".
echo Untuk update: jalankan update.bat.
echo.
echo Anda bisa tutup jendela ini setelah aplikasi jalan.
pause
