@echo off
rem ===========================================================================
rem  Sao luu bb-prod hang tuan. Danh cho Task Scheduler cua Windows.
rem  OWNER: DEV-OPS. Spec: docs/11-deployment.md muc 7.
rem ===========================================================================
rem
rem  Vi sao can tep nay thay vi goi thang "npm run db:backup:prod":
rem
rem  Task Scheduler chay lenh voi thu muc lam viec la C:\Windows\System32, chu
rem  khong phai thu muc du an. npm o day khong thay package.json nen bao
rem  "Missing script", ma Task Scheduler chi ghi lai ma thoat chu khong ghi lai
rem  loi -- nen cai sai nay im lang hang thang troi.
rem
rem  %~dp0 la thu muc chua chinh tep .cmd nay, nen doi may hay doi duong dan
rem  deu khong phai sua gi.
rem
rem  Cach hen gio: xem docs/11-deployment.md muc 7.
rem ===========================================================================

setlocal

cd /d "%~dp0.."
if errorlevel 1 (
  echo Khong vao duoc thu muc du an "%~dp0.."
  exit /b 2
)

rem Ghi nhat ky ra CANH thu muc sao luu, khong ghi vao trong kho.
rem Khong co bien BACKUP_DIR thi dung dung mac dinh cua backup.mjs.
if "%BACKUP_DIR%"=="" set "BACKUP_DIR=%~dp0..\..\babybean-backups"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo [%date% %time%] bat dau>>"%BACKUP_DIR%\nhat-ky-sao-luu.txt"

call npm run db:backup:prod >>"%BACKUP_DIR%\nhat-ky-sao-luu.txt" 2>&1
set "MA=%errorlevel%"

if "%MA%"=="0" (
  echo [%date% %time%] xong>>"%BACKUP_DIR%\nhat-ky-sao-luu.txt"
) else (
  echo [%date% %time%] HONG - ma thoat %MA%>>"%BACKUP_DIR%\nhat-ky-sao-luu.txt"
)

echo.>>"%BACKUP_DIR%\nhat-ky-sao-luu.txt"
exit /b %MA%
