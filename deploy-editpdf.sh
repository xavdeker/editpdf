#!/bin/bash

# =============================================================================
# Script de deploiement PDFEdit
# =============================================================================
#
# PREMIER DEPLOIEMENT (commandes manuelles a executer une seule fois) :
#
#   # 1. Activer le vhost Apache
#   sudo cp /var/www/mypdfeditor/mypdfcreator.conf /etc/apache2/sites-available/editpdf.conf
#   sudo a2ensite editpdf.conf
#   sudo a2enmod expires headers rewrite
#   sudo systemctl reload apache2
#
#   # 2. Installer le certificat SSL (editpdf.fr)
#   sudo certbot --apache -d editpdf.fr -d www.editpdf.fr
#
#   # 3. Deployer normalement
#   sudo bash deploy-editpdf.sh
#
# =============================================================================

set -e  # Arreter en cas d'erreur

# Variables
APP_DIR="/var/www/mypdfeditor"
BRANCH="main"
NPM_BIN="npm"
WEB_USER="www-data"

# Ajouter snap au PATH (npm/node installes via snap)
export PATH="$PATH:/snap/bin"

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}   Deploiement PDFEdit - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BLUE}=============================================${NC}"

# Aller dans le repertoire de l'application
cd $APP_DIR

# 1. Recuperer les dernieres modifications
echo -e "\n${YELLOW}[1/5] Recuperation du code depuis GitHub...${NC}"
git fetch origin
git reset --hard origin/$BRANCH
chmod +x $APP_DIR/deploy-editpdf.sh
echo -e "${GREEN}✓ Code recupere${NC}"

# 2. Installer les dependances npm
echo -e "\n${YELLOW}[2/5] Installation des dependances npm...${NC}"
$NPM_BIN ci
echo -e "${GREEN}✓ Dependances npm installees${NC}"

# 3. Build de production (TypeScript + Vite)
echo -e "\n${YELLOW}[3/5] Build de production...${NC}"
$NPM_BIN run build
echo -e "${GREEN}✓ Build termine${NC}"

# 4. Corriger les permissions
echo -e "\n${YELLOW}[4/5] Correction des permissions...${NC}"
if [ "$(id -u)" -eq 0 ]; then
    chown -R $WEB_USER:$WEB_USER dist/ 2>/dev/null || true
    find dist/ -type d -exec chmod 755 {} \;
    find dist/ -type f -exec chmod 644 {} \;
    echo -e "${GREEN}✓ Permissions corrigees${NC}"
else
    chmod -R 755 dist/ 2>/dev/null || true
    echo -e "${YELLOW}⚠ Execute sans sudo, permissions ajustees en mode non-root${NC}"
fi

# 5. Verification post-deploiement
echo -e "\n${YELLOW}[5/5] Verification...${NC}"
if [ -f "dist/index.html" ]; then
    ASSET_COUNT=$(find dist/assets -type f 2>/dev/null | wc -l)
    DIST_SIZE=$(du -sh dist/ 2>/dev/null | cut -f1)
    echo -e "${GREEN}✓ dist/index.html present${NC}"
    echo -e "${GREEN}✓ ${ASSET_COUNT} assets compiles (${DIST_SIZE})${NC}"
else
    echo -e "${RED}✗ dist/index.html manquant, le build a peut-etre echoue${NC}"
    exit 1
fi

echo -e "\n${BLUE}=============================================${NC}"
echo -e "${GREEN}   Deploiement termine avec succes !${NC}"
echo -e "${BLUE}=============================================${NC}"
