@echo off
echo === MyDiary Git Push Script ===
cd /d f:\project\DiaryApp\CascadeProjects\windsurf-project

echo Running build to check for errors...
npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Aborting git push.
  echo Fix the errors above and run git-push.bat again.
  exit /b 1
)

echo.
echo Build succeeded. Preparing to push changes...

REM Use all arguments as commit message if provided, otherwise use a default
set "COMMIT_MSG=%*"
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Auto commit from git-push.bat"

echo.
echo [1/3] Adding changes...
git add -A --verbose

echo.
echo [2/3] Committing: %date% %time% - %COMMIT_MSG%
git commit -m "%date% %time% - %COMMIT_MSG%"
if errorlevel 1 (
  echo.
  echo Git commit failed (possibly no changes to commit). Aborting push.
  exit /b 1
)

echo.
echo [3/3] Pushing to GitHub...
git push
if errorlevel 1 (
  echo.
  echo Git push failed. Please check the error above.
  exit /b 1
)

echo.
echo === Done! ===
