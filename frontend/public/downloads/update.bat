@echo off
REM ============================================================
REM MKS Management System — Auto Update Script (Windows)
REM Pulls latest code from GitHub, installs new deps, prompts restart.
REM
REM USAGE: Double-click update.bat OR run from cmd inside project root.
REM PREREQUISITE: Git installed and repo cloned via `git clone`.
REM ============================================================

setlocal enabledelayedexpansion
title MKS Update

cd /d "%~dp0"

echo.
echo ===============================================
echo   MKS Management System - AUTO UPDATE
echo ===============================================
echo.
echo Current directory: %CD%
echo.

REM --- 1. Sanity check: is this a git repo? ---
if not exist ".git" (
  echo [ERROR] Folder ini bukan git repository.
  echo Pastikan Anda menjalankan update.bat di folder tempat "git clone" dilakukan.
  echo.
  pause
  exit /b 1
)

REM --- 2. Backup .env files (jangan sampai ke-overwrite git pull) ---
echo [1/5] Backup file .env...
if exist "backend\.env" copy /Y "backend\.env" "backend\.env.bak" >nul
if exist "frontend\.env" copy /Y "frontend\.env" "frontend\.env.bak" >nul
echo   OK
echo.

REM --- 3. Git pull ---
echo [2/5] Pull update terbaru dari GitHub...
git fetch --all
git pull
if errorlevel 1 (
  echo.
  echo [ERROR] Git pull gagal. Mungkin ada perubahan lokal yang belum di-commit.
  echo Jalankan: git stash ^&^& update.bat ^&^& git stash pop
  echo.
  pause
  exit /b 1
)
echo   OK
echo.

REM --- 4. Restore .env kalau tidak ada di repo ---
if not exist "backend\.env" if exist "backend\.env.bak" copy /Y "backend\.env.bak" "backend\.env" >nul
if not exist "frontend\.env" if exist "frontend\.env.bak" copy /Y "frontend\.env.bak" "frontend\.env" >nul

REM --- 5. Backend: install/upgrade Python deps ---
echo [3/5] Install/upgrade Python dependencies...
cd backend
if exist "requirements.txt" (
  pip install -q -r requirements.txt
  if errorlevel 1 (
    echo   [WARN] pip install ada error, cek log di atas
  ) else (
    echo   OK
  )
) else (
  echo   [SKIP] backend\requirements.txt tidak ada
)
cd ..
echo.

REM --- 6. Frontend: install/upgrade Node deps ---
echo [4/5] Install/upgrade Node dependencies (yarn)...
cd frontend
if exist "package.json" (
  where yarn >nul 2>&1
  if errorlevel 1 (
    echo   [WARN] yarn tidak ditemukan, coba pakai npm
    npm install --silent
  ) else (
    yarn install --silent
  )
  if errorlevel 1 (
    echo   [WARN] install ada error, cek log di atas
  ) else (
    echo   OK
  )
) else (
  echo   [SKIP] frontend\package.json tidak ada
)
cd ..
echo.

REM --- 7. Show latest commit info ---
echo [5/5] Update selesai. Latest commit:
git log -1 --pretty=format:"  %%h - %%an - %%s" --abbrev=7
echo.
echo.

echo ===============================================
echo   UPDATE BERHASIL
echo ===============================================
echo.
echo LANGKAH SELANJUTNYA:
echo   1. Tutup cmd window yang menjalankan backend (Ctrl+C)
echo   2. Tutup cmd window yang menjalankan frontend (Ctrl+C)
echo   3. Jalankan start.bat untuk restart aplikasi
echo.
echo Backup file .env tersimpan sebagai .env.bak
echo.
pause
