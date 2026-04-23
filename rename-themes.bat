@echo off
echo === Renaming Theme Images ===
cd /d f:\project\DiaryApp\CascadeProjects\windsurf-project\Images

echo [1/20] Renaming dark themes...
git mv "image-1-Dark_transgender_pride_backgro.webp" "trans-pride-dark.webp"
git mv "image-2-Dark_background_featuring_deli.webp" "elegant-dark.webp"
git mv "image-3-Dark_transgender_support_backg.webp" "support-dark.webp"
git mv "image-4-Dark_background_with_abstract_.webp" "abstract-dark.webp"
git mv "image-5-Dark_transgender_community_bac.webp" "community-dark.webp"
git mv "image-6-Dark_background_with_flowing_r.webp" "flowing-rivers-dark.webp"
git mv "image-7-Dark_transgender_journey_backg.webp" "journey-dark.webp"
git mv "image-8-Dark_background_featuring_abst.webp" "abstract-shapes-dark.webp"
git mv "image-9-Dark_transgender_strength_back.webp" "strength-dark.webp"
git mv "image-10-Dark_background_with_constella.webp" "constellation-night.webp"

echo [11/20] Renaming light themes...
git mv "image-11-Light_transgender_pride_backgr.webp" "trans-pride-light.webp"
git mv "image-12-Light_background_featuring_blo.webp" "blooming-light.webp"
git mv "image-13-Light_transgender_support_back.webp" "support-light.webp"
git mv "image-14-Light_background_with_abstract.webp" "abstract-light.webp"
git mv "image-15-Light_transgender_community_ba.webp" "community-light.webp"
git mv "image-16-Light_background_with_sunrise_.webp" "sunrise-hope.webp"
git mv "image-17-Light_transgender_journey_back.webp" "journey-light.webp"
git mv "image-18-Light_background_featuring_abs.webp" "soft-abstract-light.webp"
git mv "image-19-Light_transgender_pride_backgr.webp" "pride-light.webp"
git mv "image-20-Light_background_with_abstract.webp" "modern-abstract-light.webp"

echo.
echo === Done! ===
echo Files renamed. Run git-push.bat to commit these changes.
pause
