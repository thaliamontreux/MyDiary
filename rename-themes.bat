@echo off
echo === Migrating Theme Images to themes/ folder structure ===

echo Creating theme directories...
for %%T in (
  trans-pride-dark elegant-dark support-dark abstract-dark community-dark
  flowing-rivers-dark journey-dark abstract-shapes-dark strength-dark constellation-night
  trans-pride-light blooming-light support-light abstract-light community-light
  sunrise-hope journey-light soft-abstract-light pride-light modern-abstract-light
) do mkdir "themes\%%T" 2>nul

echo Moving images via git mv...
git mv "Images\trans-pride-dark.webp"       "themes\trans-pride-dark\background.webp"
git mv "Images\elegant-dark.webp"           "themes\elegant-dark\background.webp"
git mv "Images\support-dark.webp"           "themes\support-dark\background.webp"
git mv "Images\abstract-dark.webp"          "themes\abstract-dark\background.webp"
git mv "Images\community-dark.webp"         "themes\community-dark\background.webp"
git mv "Images\flowing-rivers-dark.webp"    "themes\flowing-rivers-dark\background.webp"
git mv "Images\journey-dark.webp"           "themes\journey-dark\background.webp"
git mv "Images\abstract-shapes-dark.webp"   "themes\abstract-shapes-dark\background.webp"
git mv "Images\strength-dark.webp"          "themes\strength-dark\background.webp"
git mv "Images\constellation-night.webp"    "themes\constellation-night\background.webp"
git mv "Images\trans-pride-light.webp"      "themes\trans-pride-light\background.webp"
git mv "Images\blooming-light.webp"         "themes\blooming-light\background.webp"
git mv "Images\support-light.webp"          "themes\support-light\background.webp"
git mv "Images\abstract-light.webp"         "themes\abstract-light\background.webp"
git mv "Images\community-light.webp"        "themes\community-light\background.webp"
git mv "Images\sunrise-hope.webp"           "themes\sunrise-hope\background.webp"
git mv "Images\journey-light.webp"          "themes\journey-light\background.webp"
git mv "Images\soft-abstract-light.webp"    "themes\soft-abstract-light\background.webp"
git mv "Images\pride-light.webp"            "themes\pride-light\background.webp"
git mv "Images\modern-abstract-light.webp"  "themes\modern-abstract-light\background.webp"

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
echo === Done! Run: git push ===
