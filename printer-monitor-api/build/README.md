# Build Resources

This directory contains resources used for building the desktop application.

## Required Icons

For production builds, you need to provide the following icons:

### Windows
- `icon.ico` - 256x256 multi-resolution ICO file

### macOS  
- `icon.icns` - macOS icon file (can be generated from PNG)

### Linux
- `icons/` directory with:
  - `16x16.png`
  - `32x32.png`
  - `48x48.png`
  - `64x64.png`
  - `128x128.png`
  - `256x256.png`
  - `512x512.png`

### Tray Icon
- `tray-icon.png` - 16x16 or 22x22 PNG for system tray (should have transparency)
- `tray-icon@2x.png` - 32x32 or 44x44 PNG for retina displays

## Generating Icons

### From a source PNG (512x512 or larger):

**Windows (ICO):**
```bash
# Using ImageMagick
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

**macOS (ICNS):**
```bash
# Create iconset directory
mkdir icon.iconset
sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

**Linux:**
```bash
# Create icons directory and resize
for size in 16 32 48 64 128 256 512; do
  convert icon.png -resize ${size}x${size} icons/${size}x${size}.png
done
```

## Online Tools

You can also use online tools:
- https://icoconvert.com/ - For ICO files
- https://cloudconvert.com/png-to-icns - For ICNS files
- https://realfavicongenerator.net/ - For all formats

## Placeholder

Until you have final icons, the app will use system default icons or empty placeholders.
