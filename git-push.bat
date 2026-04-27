@echo off
echo ==================================================
echo === MyDiary Git Push Script - Automated Helper ===
echo ==================================================
echo.
echo [INFO] Changing to project directory...
echo [CMD ] cd /d f:\project\DiaryApp\CascadeProjects\windsurf-project
cd /d f:\project\DiaryApp\CascadeProjects\windsurf-project
echo.
echo [STEP 1] Running build to check for errors (npm run build)...
echo [CMD ] npm run build
call npm run build
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed with errorlevel %errorlevel%.
  echo [HINT ] Fix the build errors shown above and run git-push.bat again.
  exit /b 1
)

echo.
echo [OK   ] Build succeeded. Preparing to push changes...

REM Use all arguments as commit message if provided, otherwise use a default
set "COMMIT_MSG=%*"
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Auto commit from git-push.bat"

echo.
echo [INFO] Using commit message: "%COMMIT_MSG%"

echo.
echo [STEP 2] Showing current git status before commit...
echo [CMD ] git status -sb
git status -sb

echo.
echo [STEP 3] Adding changes to staging area...
echo [CMD ] git add -A --verbose
git add -A --verbose

echo.
echo [STEP 4] Committing changes...
echo [INFO] Commit label: %date% %time% - %COMMIT_MSG%
echo [CMD ] git commit -m "%date% %time% - %COMMIT_MSG%"
git commit -m "%date% %time% - %COMMIT_MSG%"
if errorlevel 1 (
  echo.
  echo [ERROR] Git commit failed with errorlevel %errorlevel%.
  echo [INFO ] This usually means there were no changes to commit OR another git error occurred.
  echo [HINT ] See the git error message above for exact details.
  echo [STOP ] Aborting push.
  exit /b 1
)

echo.
echo [STEP 5] Pushing to GitHub remote...
echo [CMD ] git push
git push
if errorlevel 1 (
  echo.
  echo [ERROR] Git push failed with errorlevel %errorlevel%.
  echo [INFO ] This is usually due to auth issues, network problems, or branch protection.
  echo [HINT ] Check the git error message above and fix the issue, then rerun git-push.bat.
  echo [STOP ] Aborting.
  exit /b 1
)

echo.
echo [DONE ] Git push completed successfully.
echo ==================================================
echo ===            All tasks completed.             ===
echo ==================================================
