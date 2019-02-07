@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"

choco install git golang mariadb nodejs python vscode -y
refreshenv
git config --global core.autocrlf false
git config --global pull.rebase true
mkdir %GOPATH%\src\github.com\Zamiell
cd %GOPATH%\src\github.com\Zamiell
git clone https://github.com/Zamiell/hanabi-live.git
cd hanabi-live
install\install_dependencies.sh
install\install_development_dependencies.sh
