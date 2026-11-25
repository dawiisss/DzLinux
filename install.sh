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

fail() {
    echo -e "${RED}$1${NC}" >&2
    exit 1
}

# Decode the tag and each asset together so its digest stays tied to its URL.
parse_release() {
    if command -v jq &> /dev/null; then
        jq -er '
            (.tag_name // error("Missing release tag")),
            (.assets[] | [.name, .browser_download_url, (.digest // "-")] | @tsv)
        '
    elif command -v python3 &> /dev/null; then
        python3 -c '
import json, sys

release = json.load(sys.stdin)
print(release["tag_name"])
for asset in release["assets"]:
    print(asset["name"], asset["browser_download_url"], asset.get("digest") or "-", sep="\t")
'
    else
        fail "DzLinux needs jq or Python 3 to read and verify release metadata."
    fi
}

echo -e "${BLUE}Fetching latest release info from GitHub...${NC}"
RELEASE_METADATA=$(curl -fsSL --proto '=https' --proto-redir '=https' \
    "https://api.github.com/repos/dawiisss/DzLinux/releases/latest" | parse_release) ||
    fail "Could not read the latest DzLinux release from GitHub."
mapfile -t RELEASE_ROWS <<< "$RELEASE_METADATA"
VERSION=${RELEASE_ROWS[0]:-}
[[ $VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-+][a-zA-Z0-9.-]+)?$ ]] ||
    fail "GitHub returned an invalid DzLinux release tag."
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

find_release_asset() {
    local suffix=$1 row name url digest
    for row in "${RELEASE_ROWS[@]:1}"; do
        IFS=$'\t' read -r name url digest <<< "$row"
        if [[ $name == *"$suffix" ]]; then
            [[ $url == "https://github.com/dawiisss/DzLinux/releases/download/$VERSION/$name" ]] ||
                fail "Invalid download URL for $name."
            ASSET_URL=$url
            ASSET_DIGEST=$digest
            return 0
        fi
    done
    return 1
}

download_and_verify() {
    local output_name=$1
    local output_path="$TEMP_DIR/$output_name"
    local expected_hash=${ASSET_DIGEST#sha256:}
    [[ $ASSET_DIGEST == sha256:* && $expected_hash =~ ^[0-9a-fA-F]{64}$ ]] ||
        fail "GitHub did not provide a valid SHA-256 checksum for $output_name."

    echo -e "${BLUE}Downloading ${output_name} from: $ASSET_URL${NC}"
    curl -fsSL --proto '=https' --proto-redir '=https' -o "$output_path" "$ASSET_URL" ||
        fail "Download failed for $output_name."
    if ! printf '%s  %s\n' "${expected_hash,,}" "$output_path" | sha256sum --check --status; then
        fail "Checksum verification failed for $output_name."
    fi
    echo -e "${GREEN}Checksum verified successfully.${NC}"
}

case "$OS_TYPE" in
    "debian")
        echo -e "${GREEN}Debian/Ubuntu-based system detected.${NC}"
        if find_release_asset ".deb"; then
            FILE_NAME="dzlinux.deb"
            download_and_verify "$FILE_NAME"
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
        if find_release_asset ".rpm"; then
            FILE_NAME="dzlinux.rpm"
            download_and_verify "$FILE_NAME"
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
    if ! find_release_asset ".AppImage"; then
        # Try finding a tar.gz as ultimate fallback
        if ! find_release_asset ".tar.gz"; then
            echo -e "${RED}Error: No suitable installer format (.deb, .rpm, .AppImage, or .tar.gz) was found in the release assets.${NC}"
            exit 1
        fi
        
        # Tar.gz installation
        FILE_NAME="dzlinux.tar.gz"
        download_and_verify "$FILE_NAME"
        echo -e "${BLUE}Extracting archive to /opt/dzlinux...${NC}"
        mkdir -p "$TEMP_DIR/opt-dzlinux"
        tar -xzf "$TEMP_DIR/$FILE_NAME" -C "$TEMP_DIR/opt-dzlinux" --strip-components=1 --no-same-owner --no-same-permissions
        sudo rm -rf /opt/dzlinux
        sudo mv "$TEMP_DIR/opt-dzlinux" /opt/dzlinux
        sudo chown -R root:root /opt/dzlinux
        sudo ln -sf /opt/dzlinux/dzlinux /usr/local/bin/dzlinux
    else
        # AppImage installation
        FILE_NAME="dzlinux.AppImage"
        download_and_verify "$FILE_NAME"
        echo -e "${BLUE}Installing executable to /usr/local/bin/dzlinux...${NC}"
        sudo install -o root -g root -m 0755 "$TEMP_DIR/$FILE_NAME" /usr/local/bin/dzlinux
    fi

    # Create desktop shortcut for AppImage/tar.gz fallback
    echo -e "${BLUE}Creating desktop environment integrations...${NC}"
    
    # Download icon
    ICON_DIR="/usr/share/icons/hicolor/512x512/apps"
    if curl -fsSL --proto '=https' --proto-redir '=https' -o "$TEMP_DIR/dzlinux.png" "https://raw.githubusercontent.com/dawiisss/DzLinux/main/src/assets/icon.png"; then
        sudo mkdir -p "$ICON_DIR"
        sudo install -o root -g root -m 0644 "$TEMP_DIR/dzlinux.png" "$ICON_DIR/dzlinux.png"
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
    sudo install -o root -g root -m 0644 "$TEMP_DIR/DzLinux.desktop" "$DESKTOP_DIR/DzLinux.desktop"
    
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
