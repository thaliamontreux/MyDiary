@echo off
echo === MyDiary Git Push Script ===
cd /d f:\project\DiaryApp\CascadeProjects\windsurf-project

echo.
echo [1/3] Adding changes...
git add -A --verbose

echo.
echo [2/3] Committing: %date% %time%
git commit -m "%date% %time%"

echo.
echo [3/3] Pushing to GitHub...
git push

echo.
echo === Done! ===
