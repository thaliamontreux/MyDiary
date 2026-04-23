@echo off
echo Moving remaining light themes...
move Images\sunrise-hope.webp       themes\sunrise-hope\background.webp
move Images\journey-light.webp      themes\journey-light\background.webp
move Images\soft-abstract-light.webp themes\soft-abstract-light\background.webp
move Images\pride-light.webp        themes\pride-light\background.webp
move Images\modern-abstract-light.webp themes\modern-abstract-light\background.webp

echo Writing theme.json files...
for %%T in (
  trans-pride-dark elegant-dark support-dark abstract-dark community-dark
  flowing-rivers-dark journey-dark abstract-shapes-dark strength-dark constellation-night
  trans-pride-light blooming-light support-light abstract-light community-light
  sunrise-hope journey-light soft-abstract-light pride-light modern-abstract-light
) do echo {"id":"%%T","name":"%%T","image":"themes/%%T/background.webp"} > "themes\%%T\theme.json"

echo Staging and committing...
git add -A
git commit -m "Restructure themes into themes/<id>/ directories"

echo.
echo === Done! Now run: git push ===
