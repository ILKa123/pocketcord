# Сборка APK (arm64) на Windows без режима разработчика и установка на телефон по ADB.
#   .\tools\build-apk.ps1            — отладочная сборка (быстро)
#   .\tools\build-apk.ps1 -Release   — релиз: полная оптимизация Rust (LTO), R8, без отладки
#   -NoInstall                       — только собрать APK
param([switch]$Release, [switch]$NoInstall)
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\jdk17"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\27.2.12479018"
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\pc-target"
$env:PATH = "$env:LOCALAPPDATA\Programs\mingw64\bin;$env:USERPROFILE\.cargo\bin;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
$profile = if ($Release) { 'release' } else { 'debug' }
$Variant = if ($Release) { 'Release' } else { 'Debug' }

# 1. Rust -> .so (шаг с симлинком у Tauri упадёт — это ожидаемо)
Set-Location $root
$flags = @('tauri', 'android', 'build', '--apk', '--target', 'aarch64', '--ci')
if (-not $Release) { $flags += '--debug' }
& cargo @flags 2>&1 | ForEach-Object { "$_" } | Select-String -Pattern '^error|^\s+-->|Finished' | ForEach-Object { $_.Line }
$so = "$env:CARGO_TARGET_DIR\aarch64-linux-android\$profile\libpocketcord_lib.so"
Write-Output ("so time: " + (Get-Item $so).LastWriteTime)

# 1б. RustWebView.kt генерируется заново при каждой сборке — дописываем приём картинок с клавиатуры
$rwv = "$root\src-tauri\gen\android\app\src\main\java\com\pocketcord\app\generated\RustWebView.kt"
$code = [IO.File]::ReadAllText($rwv)
if ($code -notmatch 'ImageInput') {
  $hook = @'
    override fun onCreateInputConnection(outAttrs: android.view.inputmethod.EditorInfo): android.view.inputmethod.InputConnection? =
        com.pocketcord.app.ImageInput.wrap(this, super.onCreateInputConnection(outAttrs), outAttrs)
}
'@
  $i = $code.LastIndexOf('}')
  $code = $code.Substring(0, $i) + $hook
  [IO.File]::WriteAllText($rwv, $code, (New-Object Text.UTF8Encoding $false))
  Write-Output "RustWebView patched"
}

# 2. Кладём .so в jniLibs без отладочной информации
$android = "$root\src-tauri\gen\android"
$jni = "$android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force $jni | Out-Null
& "$env:NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-strip.exe" --strip-debug $so -o "$jni\libpocketcord_lib.so"

# 3. Gradle без повторной сборки Rust
Set-Location $android
[Environment]::CurrentDirectory = $android
& "$android\gradlew.bat" "assembleArm64$Variant" -x "rustBuildArm64$Variant" -q
if ($LASTEXITCODE -ne 0) { Write-Output "GRADLE FAILED - APK not updated"; exit 1 }
$apk = Get-ChildItem "$android\app\build\outputs\apk" -Recurse -Filter *.apk | Where-Object { $_.FullName -match $profile } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$out = if ($Release) { "$root\Pocketcord-1.3.0-arm64.apk" } else { "$root\Pocketcord-debug-arm64.apk" }
Copy-Item $apk.FullName $out -Force
Write-Output ("{0} {1:N1} MB" -f (Split-Path $out -Leaf), ((Get-Item $out).Length / 1MB))

# 4. Установка и запуск
if (-not $NoInstall) {
  adb install -r $out
  adb shell monkey -p com.pocketcord.app -c android.intent.category.LAUNCHER 1 | Out-Null
}
