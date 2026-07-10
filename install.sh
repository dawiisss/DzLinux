#!/usr/bin/env bash
set -euo pipefail

# DzLinux Installer Script
# Host/Command: curl -sSL https://raw.githubusercontent.com/dawiisss/DzLinux/main/install.sh | bash

# Color codes for visual styling
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Title Banner
echo -e "${CYAN}${BOLD}"
echo "============================================="
echo "        DZLINUX STANDALONE INSTALLER        "
echo "============================================="
echo -e "${NC}"
echo -e "${YELLOW}This installer will install DzLinux and all its dependencies.${NC}"
echo -e "${YELLOW}It will also create a desktop shortcut for DzLinux.${NC}"
echo -e "${YELLOW}Please note that this installer will not install the DayZ game itself.${NC}"
echo -e "${YELLOW}You will need to install the game separately.${NC}"
echo -e "${YELLOW}The game can be installed from the Steam client or Epic Games client(Lutris/Heroic).${NC}"

# Check for curl
if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl is required but not installed. Please install curl first.${NC}"
    exit 1
fi

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
    echo -e "${RED}Error: DzLinux only supports x86_64 systems at this time.${NC}"
    exit 1
fi

# Fetch release JSON
echo -e "${BLUE}Fetching latest release info from GitHub...${NC}"
RELEASE_JSON=$(curl -s "https://api.github.com/repos/dawiisss/DzLinux/releases/latest")

if echo "$RELEASE_JSON" | grep -q '"message":'; then
    MSG=$(echo "$RELEASE_JSON" | grep '"message":' | sed -E 's/.*"message": "([^"]+)".*/\1/')
    echo -e "${RED}GitHub API Error: $MSG${NC}"
    echo -e "${YELLOW}This usually happens if the release hasn't been published yet, or if you've hit GitHub's unauthenticated API rate limit.${NC}"
    exit 1
fi

VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
echo -e "${GREEN}Detected latest version: ${BOLD}${VERSION}${NC}"

# Temporary download directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Detect package manager
OS_TYPE="unknown"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID=$ID
    OS_LIKE=${ID_LIKE:-""}
else
    OS_ID="unknown"
    OS_LIKE="unknown"
fi

echo -e "${BLUE}Detecting system distribution... (ID: $OS_ID, LIKE: $OS_LIKE)${NC}"

if command -v dpkg &> /dev/null && command -v apt-get &> /dev/null; then
    OS_TYPE="debian"
elif command -v rpm &> /dev/null && (command -v dnf &> /dev/null || command -v yum &> /dev/null); then
    OS_TYPE="redhat"
else
    OS_TYPE="appimage"
fi

# Helper function to extract download url
get_download_url() {
    local file_ext=$1
    # Match the file extension exactly before the closing quote to avoid downloading .zsync or .sha256 files
    echo "$RELEASE_JSON" | grep "browser_download_url" | grep -E "${file_ext}\"" | head -n 1 | cut -d '"' -f 4 || echo ""
}

# Helper function to download and optionally verify checksum
download_and_verify() {
    local ext=$1
    local output_name=$2
    local url=$3
    
    echo -e "${BLUE}Downloading ${output_name} from: $url${NC}"
    curl -L -o "$TEMP_DIR/$output_name" "$url"
    
    local sha_url=$(get_download_url "${ext}\.sha256")
    if [ -n "$sha_url" ]; then
        echo -e "${BLUE}Downloading checksum...${NC}"
        curl -sL -o "$TEMP_DIR/$output_name.sha256" "$sha_url"
        echo -e "${BLUE}Verifying checksum...${NC}"
        local expected_hash=$(awk '{print $1}' "$TEMP_DIR/$output_name.sha256")
        local actual_hash=$(sha256sum "$TEMP_DIR/$output_name" | awk '{print $1}')
        if [ "$expected_hash" != "$actual_hash" ]; then
            echo -e "${RED}Error: Checksum verification failed!${NC}"
            echo -e "${RED}Expected: $expected_hash${NC}"
            echo -e "${RED}Actual:   $actual_hash${NC}"
            exit 1
        fi
        echo -e "${GREEN}Checksum verified successfully.${NC}"
    fi
}

case "$OS_TYPE" in
    "debian")
        echo -e "${GREEN}Debian/Ubuntu-based system detected.${NC}"
        URL=$(get_download_url "\.deb")
        if [ -n "$URL" ]; then
            FILE_NAME="dzlinux.deb"
            download_and_verify "\.deb" "$FILE_NAME" "$URL"
            echo -e "${BLUE}Installing package via apt (requires sudo)...${NC}"
            sudo apt-get update
            sudo apt-get install -y "$TEMP_DIR/$FILE_NAME"
            echo -e "${GREEN}${BOLD}DzLinux has been successfully installed!${NC}"
        else
            echo -e "${YELLOW}Warning: Deb package not found in latest release assets. Falling back to AppImage.${NC}"
            OS_TYPE="appimage"
        fi
        ;;
    "redhat")
        echo -e "${GREEN}Fedora/RHEL/CentOS-based system detected.${NC}"
        URL=$(get_download_url "\.rpm")
        if [ -n "$URL" ]; then
            FILE_NAME="dzlinux.rpm"
            download_and_verify "\.rpm" "$FILE_NAME" "$URL"
            echo -e "${BLUE}Installing package via dnf (requires sudo)...${NC}"
            if command -v dnf &> /dev/null; then
                sudo dnf install -y "$TEMP_DIR/$FILE_NAME"
            else
                sudo yum install -y "$TEMP_DIR/$FILE_NAME"
            fi
            echo -e "${GREEN}${BOLD}DzLinux has been successfully installed!${NC}"
        else
            echo -e "${YELLOW}Warning: RPM package not found in latest release assets. Falling back to AppImage.${NC}"
            OS_TYPE="appimage"
        fi
        ;;
esac

if [ "$OS_TYPE" = "appimage" ]; then
    echo -e "${GREEN}Using AppImage fallback installation...${NC}"
    URL=$(get_download_url "\.AppImage")
    if [ -z "$URL" ]; then
        # Try finding a tar.gz as ultimate fallback
        URL=$(get_download_url "\.tar\.gz")
        if [ -z "$URL" ]; then
            echo -e "${RED}Error: No suitable installer format (.deb, .rpm, .AppImage, or .tar.gz) was found in the release assets.${NC}"
            exit 1
        fi
        
        # Tar.gz installation
        FILE_NAME="dzlinux.tar.gz"
        download_and_verify "\.tar\.gz" "$FILE_NAME" "$URL"
        echo -e "${BLUE}Extracting archive to /opt/dzlinux...${NC}"
        sudo mkdir -p /opt/dzlinux
        sudo tar -xzf "$TEMP_DIR/$FILE_NAME" -C /opt/dzlinux --strip-components=1
        sudo ln -sf /opt/dzlinux/dzlinux /usr/local/bin/dzlinux
    else
        # AppImage installation
        FILE_NAME="dzlinux.AppImage"
        download_and_verify "\.AppImage" "$FILE_NAME" "$URL"
        echo -e "${BLUE}Moving executable to /usr/local/bin/dzlinux...${NC}"
        sudo mv "$TEMP_DIR/$FILE_NAME" /usr/local/bin/dzlinux
        sudo chmod +x /usr/local/bin/dzlinux
    fi

    # Create desktop shortcut for AppImage/tar.gz fallback
    echo -e "${BLUE}Creating desktop environment integrations...${NC}"
    
    # Download icon
    ICON_DIR="/usr/share/icons/hicolor/512x512/apps"
    curl -s -L -o "$TEMP_DIR/dzlinux.png" "https://raw.githubusercontent.com/dawiisss/DzLinux/main/build/icon.png" || true
    if [ -f "$TEMP_DIR/dzlinux.png" ]; then
        sudo mkdir -p "$ICON_DIR"
        sudo mv "$TEMP_DIR/dzlinux.png" "$ICON_DIR/"
    fi
    
    # Create desktop file globally
    DESKTOP_DIR="/usr/share/applications"
    cat <<EOF > "$TEMP_DIR/DzLinux.desktop"
[Desktop Entry]
Name=DzLinux
Exec=/usr/local/bin/dzlinux
Icon=dzlinux
Type=Application
Categories=Game;
Comment=DayZ Linux Server Browser & Mod Manager
StartupWMClass=DzLinux
Terminal=false
EOF
    sudo mkdir -p "$DESKTOP_DIR"
    # Clean up old shortcut names if they exist to avoid duplicates
    if [ -f "$DESKTOP_DIR/com.dawiisss.dzlinux.desktop" ]; then
        sudo rm -f "$DESKTOP_DIR/com.dawiisss.dzlinux.desktop"
    fi
    if [ -f "$DESKTOP_DIR/dzlinux.desktop" ]; then
        sudo rm -f "$DESKTOP_DIR/dzlinux.desktop"
    fi
    sudo mv "$TEMP_DIR/DzLinux.desktop" "$DESKTOP_DIR/"
    sudo chmod +x "$DESKTOP_DIR/DzLinux.desktop"
    
    # Update desktop database so the menu picks it up immediately
    if command -v update-desktop-database &> /dev/null; then
        sudo update-desktop-database "$DESKTOP_DIR" || true
    fi
    if command -v gtk-update-icon-cache &> /dev/null; then
        sudo gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
    fi
    
    # Make sure we recommend dependencies for AppImage
    echo -e "${YELLOW}Please ensure you have 'xdg-utils' installed on your system for all launcher features to function properly.${NC}"
    echo -e "${GREEN}${BOLD}DzLinux AppImage installer completed. Launch via your desktop application list or command line 'dzlinux'.${NC}"
fi
