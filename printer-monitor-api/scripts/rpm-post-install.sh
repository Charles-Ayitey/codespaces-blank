#!/bin/bash
# Post-install script for printer-monitor RPM

# Ensure executable has proper permissions
if [ -f "/opt/Printer Monitor/printer-monitor" ]; then
    chmod +x "/opt/Printer Monitor/printer-monitor"
fi

# Create symlink to /usr/bin if it doesn't exist
if [ ! -L "/usr/bin/printer-monitor" ]; then
    ln -sf "/opt/Printer Monitor/printer-monitor" "/usr/bin/printer-monitor" 2>/dev/null || true
fi

# Ensure the symlink has execute permissions
chmod +x "/usr/bin/printer-monitor" 2>/dev/null || true

exit 0
