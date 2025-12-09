#!/bin/bash
# Printer Monitor - Fedora Linux Build Script
# Builds RPM package for Fedora/RHEL/CentOS

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
header() { echo -e "${CYAN}$1${NC}"; }

header "======================================"
header "  Printer Monitor - Fedora Build"
header "======================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for required tools
log "Checking build requirements..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    error "Node.js is not installed! Install with: sudo dnf install nodejs"
fi
log "Node.js version: $(node -v)"

# Check for npm
if ! command -v npm &> /dev/null; then
    error "npm is not installed!"
fi
log "npm version: $(npm -v)"

# Check for package.json
if [ ! -f "package.json" ]; then
    error "package.json not found! Run this script from the printer-monitor-api folder"
fi

# Check for rpmbuild (optional - for native RPM building)
if command -v rpmbuild &> /dev/null; then
    log "rpmbuild available for native RPM building"
    HAS_RPMBUILD=true
else
    warn "rpmbuild not found. Install with: sudo dnf install rpm-build"
    warn "Will use electron-builder for RPM generation"
    HAS_RPMBUILD=false
fi

# Determine build type
BUILD_TYPE="${1:-electron}"

case "$BUILD_TYPE" in
    electron)
        header ""
        header "Building Electron RPM package..."
        header ""
        
        # Clean previous builds
        log "Step 1: Cleaning old builds..."
        rm -rf dist node_modules 2>/dev/null || true
        
        # Install dependencies
        log "Step 2: Installing dependencies..."
        npm install
        
        # Build RPM using electron-builder
        log "Step 3: Building RPM package..."
        npm run build:linux
        
        # Show output
        echo ""
        header "======================================"
        header "  Build Complete!"
        header "======================================"
        echo ""
        log "Output files in dist/ directory:"
        ls -la dist/*.rpm dist/*.AppImage 2>/dev/null || log "Check dist/ for output files"
        echo ""
        log "Install RPM with: sudo dnf install dist/Printer-Monitor-*.rpm"
        ;;
        
    server)
        header ""
        header "Building server-only package..."
        header ""
        
        # Create a tarball for server deployment
        VERSION=$(node -p "require('./package.json').version")
        PACKAGE_NAME="printer-monitor-server-${VERSION}"
        BUILD_DIR="dist/${PACKAGE_NAME}"
        
        log "Step 1: Creating build directory..."
        rm -rf dist 2>/dev/null || true
        mkdir -p "$BUILD_DIR"
        
        log "Step 2: Copying server files..."
        cp server.js "$BUILD_DIR/"
        cp storage.js "$BUILD_DIR/"
        cp package.json "$BUILD_DIR/"
        cp *.html "$BUILD_DIR/" 2>/dev/null || true
        cp printer-monitor.service "$BUILD_DIR/"
        cp install-linux.sh "$BUILD_DIR/"
        mkdir -p "$BUILD_DIR/data"
        
        # Create production package.json
        log "Step 3: Creating production package.json..."
        node -e "
        const pkg = require('./package.json');
        const prodPkg = {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            main: 'server.js',
            scripts: { start: 'node server.js' },
            dependencies: pkg.dependencies
        };
        delete prodPkg.dependencies['electron-store'];
        require('fs').writeFileSync('$BUILD_DIR/package.json', JSON.stringify(prodPkg, null, 2));
        "
        
        log "Step 4: Installing production dependencies..."
        cd "$BUILD_DIR"
        npm install --production
        cd "$SCRIPT_DIR"
        
        log "Step 5: Creating tarball..."
        cd dist
        tar -czvf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"
        cd "$SCRIPT_DIR"
        
        echo ""
        header "======================================"
        header "  Server Build Complete!"
        header "======================================"
        echo ""
        log "Output: dist/${PACKAGE_NAME}.tar.gz"
        echo ""
        log "To install:"
        echo "  1. Extract: tar -xzf ${PACKAGE_NAME}.tar.gz -C /opt/"
        echo "  2. Run installer: sudo /opt/${PACKAGE_NAME}/install-linux.sh"
        ;;
        
    rpm-spec)
        header ""
        header "Building native RPM using spec file..."
        header ""
        
        if [ "$HAS_RPMBUILD" != "true" ]; then
            error "rpmbuild is required. Install with: sudo dnf install rpm-build rpmdevtools"
        fi
        
        VERSION=$(node -p "require('./package.json').version")
        
        # Setup RPM build directories
        log "Step 1: Setting up RPM build environment..."
        mkdir -p ~/rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
        
        # Create source tarball
        log "Step 2: Creating source tarball..."
        TARBALL_NAME="printer-monitor-${VERSION}"
        TEMP_DIR=$(mktemp -d)
        mkdir -p "$TEMP_DIR/$TARBALL_NAME"
        
        cp server.js "$TEMP_DIR/$TARBALL_NAME/"
        cp storage.js "$TEMP_DIR/$TARBALL_NAME/"
        cp package.json "$TEMP_DIR/$TARBALL_NAME/"
        cp *.html "$TEMP_DIR/$TARBALL_NAME/" 2>/dev/null || true
        cp printer-monitor.service "$TEMP_DIR/$TARBALL_NAME/"
        mkdir -p "$TEMP_DIR/$TARBALL_NAME/data"
        
        cd "$TEMP_DIR"
        tar -czvf ~/rpmbuild/SOURCES/${TARBALL_NAME}.tar.gz "$TARBALL_NAME"
        cd "$SCRIPT_DIR"
        rm -rf "$TEMP_DIR"
        
        # Copy spec file
        log "Step 3: Copying spec file..."
        cp printer-monitor.spec ~/rpmbuild/SPECS/
        
        # Build RPM
        log "Step 4: Building RPM..."
        rpmbuild -ba ~/rpmbuild/SPECS/printer-monitor.spec
        
        # Copy output
        log "Step 5: Copying RPM to dist/..."
        mkdir -p dist
        cp ~/rpmbuild/RPMS/x86_64/printer-monitor-*.rpm dist/ 2>/dev/null || \
        cp ~/rpmbuild/RPMS/noarch/printer-monitor-*.rpm dist/ 2>/dev/null || \
        log "Check ~/rpmbuild/RPMS/ for output"
        
        echo ""
        header "======================================"
        header "  RPM Build Complete!"
        header "======================================"
        echo ""
        log "Output files:"
        ls -la dist/*.rpm 2>/dev/null || ls -la ~/rpmbuild/RPMS/*/*.rpm
        ;;
        
    *)
        echo "Usage: $0 [electron|server|rpm-spec]"
        echo ""
        echo "Build types:"
        echo "  electron   - Build Electron desktop app as RPM (default)"
        echo "  server     - Build server-only tarball for deployment"
        echo "  rpm-spec   - Build native RPM using spec file (requires rpmbuild)"
        exit 1
        ;;
esac
