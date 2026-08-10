@echo off
setlocal

rem ============================================================================
rem  esta - PDV da cabine
rem
rem  Abre o app em janela de aplicativo (sem barra de endereco nem abas) e com
rem  impressao direta: o ticket sai na impressora padrao sem passar pelo dialogo
rem  de imprimir do Chrome.
rem
rem  Uso:  pdv-cabine.bat [url]
rem        Sem argumento, abre a producao.
rem
rem  Por que um perfil separado (--user-data-dir):
rem    --kiosk-printing e lida na subida do processo do Chrome e vale pra todo o
rem    perfil enquanto ele estiver aberto -- a pagina nao consegue ligar nem
rem    desligar isso. Com perfil proprio, ela fica restrita a esta janela:
rem    fechou, acabou, e o Chrome do dia a dia continua pedindo o dialogo de
rem    impressao normalmente.
rem
rem  IMPORTANTE: a impressora do ticket tem que estar como PADRAO do Windows.
rem  No modo kiosk nao ha escolha de impressora -- vai sempre pra padrao.
rem ============================================================================

set "URL=%~1"
if "%URL%"=="" set "URL=https://sisparkweb.vercel.app"

rem Perfil so do PDV: o operador loga uma vez aqui e fica logado, sem se
rem misturar com a conta usada no Chrome normal.
set "PERFIL=%LOCALAPPDATA%\esta-pdv"

rem Fora do bloco for: o "(x86)" no nome da variavel atrapalha o parser do cmd
rem quando expandido dentro de parenteses.
set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"

set "CHROME="
for %%P in (
  "%PF%\Google\Chrome\Application\chrome.exe"
  "%PF86%\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) do if exist %%P set "CHROME=%%~P"

if not defined CHROME (
  echo.
  echo Chrome nao encontrado nos caminhos padrao.
  echo Instale o Google Chrome ou ajuste o caminho neste arquivo.
  echo.
  pause
  exit /b 1
)

start "" "%CHROME%" --app=%URL% --kiosk-printing --user-data-dir="%PERFIL%" --no-first-run --no-default-browser-check

endlocal
