@echo off
cd /d C:\Users\mnlyn\Documents\Personal\Scripts\work\PayrollMinder

echo.
echo ========================================
echo   PayrollMinder
echo ========================================
echo.
echo   1. Push (local to Apps Script + GitHub)
echo   2. Pull (Apps Script to local + GitHub)
echo   3. Open Apps Script editor
echo   4. Exit
echo.
set /p CHOICE="Choose an option: "

if "%CHOICE%"=="1" goto push
if "%CHOICE%"=="2" goto pull
if "%CHOICE%"=="3" goto open
if "%CHOICE%"=="4" exit /b 0
echo Invalid choice.
pause
exit /b 1

:: ======================================
:push
:: ======================================
echo.
echo [1/2] Pushing code to Google Apps Script...
clasp push
if %errorlevel% neq 0 (
    echo       [FAILED] clasp push failed.
    pause
    exit /b 1
)
echo       [OK] Apps Script updated.

echo.
set /p MSG="Commit message (or Enter for default): "
if "%MSG%"=="" set MSG=Update PayrollMinder

echo.
echo [2/2] Committing and pushing to GitHub...
git add .
git commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo       [SKIP] Nothing to commit — no changes detected.
) else (
    git push
    if %errorlevel% neq 0 (
        echo       [FAILED] Git push encountered an error.
        pause
        exit /b 1
    )
    echo       [OK] GitHub repo updated.
)
goto done

:: ======================================
:pull
:: ======================================
echo.
echo [1/2] Pulling latest code from Google Apps Script...
clasp pull
if %errorlevel% neq 0 (
    echo       [FAILED] clasp pull failed.
    pause
    exit /b 1
)
echo       [OK] Local files updated from Apps Script.

echo.
set /p MSG="Commit message (or Enter for default): "
if "%MSG%"=="" set MSG=Pull changes from Apps Script

echo.
echo [2/2] Committing and pushing to GitHub...
git add .
git commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo       [SKIP] Nothing to commit — no changes detected.
) else (
    git push
    if %errorlevel% neq 0 (
        echo       [FAILED] Git push encountered an error.
        pause
        exit /b 1
    )
    echo       [OK] GitHub repo updated.
)
goto done

:: ======================================
:open
:: ======================================
echo.
clasp open
goto done

:: ======================================
:done
:: ======================================
echo.
echo ========================================
echo   All done!
echo ========================================
echo.
pause
