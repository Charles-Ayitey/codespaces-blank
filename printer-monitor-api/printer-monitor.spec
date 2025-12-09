# Printer Monitor RPM Spec File for Fedora/RHEL/CentOS
# Build with: rpmbuild -ba printer-monitor.spec

Name:           printer-monitor
Version:        1.2.0
Release:        1%{?dist}
Summary:        SNMP-based printer monitoring system

License:        MIT
URL:            https://github.com/Charles-Ayitey/printer-monitor
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch
Requires:       nodejs >= 18
Requires:       npm
Requires(pre):  shadow-utils
Requires(post): systemd
Requires(preun): systemd
Requires(postun): systemd

%description
Printer Monitor is an SNMP-based printer monitoring system that tracks
printer status, supply levels, tray states, and page counts. It provides
alerting, notifications, and reporting capabilities through a web-based
dashboard and REST API.

Features:
- Real-time printer status monitoring via SNMP
- Supply level tracking (toner, drums, fusers, etc.)
- Paper tray status monitoring
- Page count tracking and analytics
- Email and webhook notifications
- Scheduled PDF/CSV reports
- Fleet-wide analytics dashboard

%prep
%setup -q

%install
# Create directories
mkdir -p %{buildroot}/opt/%{name}
mkdir -p %{buildroot}/opt/%{name}/data
mkdir -p %{buildroot}/var/log/%{name}
mkdir -p %{buildroot}%{_unitdir}

# Copy application files
cp -r server.js %{buildroot}/opt/%{name}/
cp -r storage.js %{buildroot}/opt/%{name}/
cp -r package.json %{buildroot}/opt/%{name}/
cp -r *.html %{buildroot}/opt/%{name}/ 2>/dev/null || true

# Install systemd service
cat > %{buildroot}%{_unitdir}/%{name}.service << 'EOF'
[Unit]
Description=Printer Monitor - SNMP Printer Monitoring System
Documentation=https://github.com/Charles-Ayitey/printer-monitor
After=network.target

[Service]
Type=simple
User=printermonitor
Group=printermonitor
WorkingDirectory=/opt/printer-monitor
ExecStart=/usr/bin/node /opt/printer-monitor/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=printer-monitor

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/printer-monitor/data /var/log/printer-monitor
PrivateTmp=true

# Environment
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
EOF

%pre
# Create service user/group
getent group printermonitor >/dev/null || groupadd -r printermonitor
getent passwd printermonitor >/dev/null || \
    useradd -r -g printermonitor -d /opt/%{name} -s /sbin/nologin \
    -c "Printer Monitor Service Account" printermonitor
exit 0

%post
# Install npm dependencies
cd /opt/%{name}
npm install --production --silent 2>/dev/null || true

# Set permissions
chown -R printermonitor:printermonitor /opt/%{name}
chown -R printermonitor:printermonitor /var/log/%{name}
chmod 750 /opt/%{name}
chmod 750 /opt/%{name}/data
chmod 640 /opt/%{name}/*.js
chmod 640 /opt/%{name}/*.html 2>/dev/null || true

# Enable and start service
%systemd_post %{name}.service
systemctl daemon-reload
systemctl enable %{name}.service

echo ""
echo "========================================"
echo " Printer Monitor installed successfully"
echo "========================================"
echo ""
echo "To start the service:"
echo "  sudo systemctl start printer-monitor"
echo ""
echo "Dashboard URL: http://localhost:5000"
echo ""
echo "Commands:"
echo "  systemctl status printer-monitor   - Check status"
echo "  systemctl restart printer-monitor  - Restart"
echo "  journalctl -u printer-monitor -f   - View logs"
echo ""

%preun
%systemd_preun %{name}.service

%postun
%systemd_postun_with_restart %{name}.service
if [ $1 -eq 0 ]; then
    # Package removal, not upgrade
    userdel printermonitor 2>/dev/null || true
    groupdel printermonitor 2>/dev/null || true
fi

%files
%defattr(-,root,root,-)
%dir /opt/%{name}
%dir /opt/%{name}/data
%dir /var/log/%{name}
/opt/%{name}/server.js
/opt/%{name}/storage.js
/opt/%{name}/package.json
/opt/%{name}/*.html
%{_unitdir}/%{name}.service

%changelog
* Wed Dec 04 2024 Printer Monitor Team <support@example.com> - 1.2.0-1
- Initial RPM package for Fedora
- SNMP-based printer monitoring
- Web dashboard and REST API
- Email and webhook notifications
- Scheduled reports (PDF/CSV)
