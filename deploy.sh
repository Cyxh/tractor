#!/bin/bash
# Deploy latest changes to production server
ssh root@157.180.75.10 "cd /opt/tractor && git checkout -- . && git pull && npm install && npm run build && pm2 restart tractor"
