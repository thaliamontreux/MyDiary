$base = "f:\project\DiaryApp\CascadeProjects\windsurf-project"
$files = @(
    "trans-pride-dark",
    "elegant-dark",
    "support-dark",
    "abstract-dark",
    "community-dark",
    "flowing-rivers-dark",
    "journey-dark",
    "abstract-shapes-dark",
    "strength-dark",
    "constellation-night",
    "trans-pride-light",
    "blooming-light",
    "support-light",
    "abstract-light",
    "community-light",
    "sunrise-hope",
    "journey-light",
    "soft-abstract-light",
    "pride-light",
    "modern-abstract-light"
)

foreach ($id in $files) {
    $src = "$base\Images\$id.webp"
    $dst = "$base\themes\$id\background.webp"
    if (Test-Path $src) {
        Move-Item -Path $src -Destination $dst -Force
        Write-Host "Moved: $id"
    } else {
        Write-Host "Skipped (not found): $id"
    }
}

Write-Host ""
Write-Host "All done. Now run: git add -A && git commit -m 'Move theme images to themes/<id>/background.webp' && git push"
