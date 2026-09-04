@echo off
setlocal

rem ============================================================================
rem  esta - PDV da cabine (Microsoft Edge)
rem
rem  Mesma coisa que pdv-cabine.bat, so que abrindo o Edge em vez do Chrome --
rem  use esta versao quando o Chrome da maquina do cliente ja vier com alguma
rem  politica corporativa de login obrigatorio (BrowserSignin forcado), que
rem  trava ate um perfil novo (--user-data-dir) na tela de escolher conta e
rem  impede o modo kiosk de funcionar. O Edge e outro executavel, entao nao
rem  cai nessa mesma politica -- e, sendo Chromium por baixo, aceita as
rem  mesmas flags de linha de comando.
rem
rem  Uso:  pdv-cabine-edge.bat [url]
rem        Sem argumento, abre a producao.
rem
rem  Ver docs/CABINE.md para o checklist completo (impressora padrao do
rem  Windows, desligar gerenciamento automatico, etc.) -- vale igual pro Edge.
rem ============================================================================

set "URL=%~1"
if "%URL%"=="" set "URL=https://sisparkweb.vercel.app"
rem ?dispositivo_fixo=1: diz pro app que esta maquina guarda sessao entre
rem aberturas (ver comentario equivalente em pdv-cabine.bat e src/lib/supabase.js).
set "URL=%URL%?dispositivo_fixo=1"

rem Perfil so do PDV: o operador loga uma vez aqui e fica logado, sem se
rem misturar com a conta usada no Edge normal. Nome diferente do perfil do
rem Chrome (esta-pdv) so pra ficar claro qual pasta e de qual navegador.
set "PERFIL=%LOCALAPPDATA%\esta-pdv-edge"

rem Fora do bloco for: o "(x86)" no nome da variavel atrapalha o parser do cmd
rem quando expandido dentro de parenteses.
set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"

set "EDGE="
for %%P in (
  "%PF86%\Microsoft\Edge\Application\msedge.exe"
  "%PF%\Microsoft\Edge\Application\msedge.exe"
  "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
) do if exist %%P set "EDGE=%%~P"

if not defined EDGE (
  echo.
  echo Edge nao encontrado nos caminhos padrao.
  echo Ajuste o caminho neste arquivo se estiver instalado em outro lugar.
  echo.
  pause
  exit /b 1
)

start "" "%EDGE%" --app=%URL% --start-maximized --kiosk-printing --disable-popup-blocking --user-data-dir="%PERFIL%" --no-first-run --no-default-browser-check

endlocal
