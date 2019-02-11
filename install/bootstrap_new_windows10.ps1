# Install Chocolatey
# https://chocolatey.org/
@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"

# Install necessary software
choco install git golang mariadb nodejs vscode -y
refreshenv
git config --global core.autocrlf false
git config --global pull.rebase true

# Clone the repository
mkdir %GOPATH%\src\github.com\Zamiell
cd %GOPATH%\src\github.com\Zamiell
git clone https://github.com/Zamiell/hanabi-live.git

# Install the dependencies
cd hanabi-live
install\install_dependencies.sh
install\install_development_dependencies.sh
