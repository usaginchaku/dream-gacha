@echo off
setlocal
cd /d "%~dp0"

echo キャラデータを検証して公開用ファイルを生成しています...
node tools\build-character-data.js
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" (
  echo.
  echo 完了しました。character-data.generated.js を更新しました。
) else (
  echo.
  echo 失敗しました。表示されたエラーを確認してJSONを修正してください。
)

echo.
pause
exit /b %EXIT_CODE%
