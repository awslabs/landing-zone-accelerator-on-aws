#!/bin/bash

# Security Scanner for Sensitive URLs and Content
# This script scans for sensitive internal URLs and content that should not be public
# 
# Configuration:
# - SENSITIVE_DOMAINS: Comma-separated list of sensitive domains to scan for
# - SCAN_EXCLUDE_DIRS: Space-separated list of directories to exclude
# - SCAN_EXCLUDE_FILES: Space-separated list of file patterns to exclude

set -e

echo "Starting security scan for sensitive content..."

# Exit codes
EXIT_SUCCESS=0
EXIT_SENSITIVE_FOUND=1
EXIT_CONFIG_ERROR=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counter for violations
VIOLATIONS=0

# Configuration - can be overridden by environment variables
SCAN_EXCLUDE_DIRS="${SCAN_EXCLUDE_DIRS:-.git node_modules build dist}"
SCAN_EXCLUDE_FILES="${SCAN_EXCLUDE_FILES:-*.log *.zip *.tar.gz}"

# Sensitive domains from environment variable (comma-separated)
SENSITIVE_DOMAINS="${SENSITIVE_DOMAINS:-}"

# Function to determine scanning mode and domains
determine_scan_config() {
    # Check if we're in the main repository
    if [ "$CI_PROJECT_PATH" = "landing-zone-accelerator/landing-zone-accelerator-on-aws" ]; then
        # Main repository - require full configuration
        if [ -z "$SENSITIVE_DOMAINS" ]; then
            echo -e "${RED}ERROR: SENSITIVE_DOMAINS environment variable is not set in main repository${NC}"
            echo ""
            echo -e "${YELLOW}Please set SENSITIVE_DOMAINS in GitLab project CI/CD variables.${NC}"
            exit $EXIT_CONFIG_ERROR
        fi
        SCAN_MODE="full"
        echo -e "${BLUE}Running in MAIN repository - full security scanning enabled${NC}"
    else
        # Fork repository - use basic patterns
        SCAN_MODE="basic"
        SENSITIVE_DOMAINS="\.aws\.|\.amazon\."
        echo -e "${BLUE}Running in FORK repository - basic security pattern scanning${NC}"
        echo -e "${YELLOW}Note: Limited scanning in forks. Full scanning available in main repository.${NC}"
    fi
    
    echo -e "${BLUE}Scan mode: $SCAN_MODE${NC}"
    echo -e "${BLUE}Domains/patterns: $SENSITIVE_DOMAINS${NC}"
    echo ""
}

# Function to check for sensitive patterns
check_pattern() {
    local pattern="$1"
    local description="$2"
    local files_to_scan="$3"
    
    echo -e "${BLUE}Checking for: $description${NC}"
    
    # Build exclude arguments for grep
    local exclude_args=""
    for dir in $SCAN_EXCLUDE_DIRS; do
        exclude_args="$exclude_args --exclude-dir=$dir"
    done
    for file in $SCAN_EXCLUDE_FILES; do
        exclude_args="$exclude_args --exclude=$file"
    done
    
    # Use grep to find matches
    local matches
    matches=$(grep -r $exclude_args -l "$pattern" $files_to_scan 2>/dev/null || true)
    
    if [ -n "$matches" ]; then
        echo -e "${RED}VIOLATION: Found $description${NC}"
        echo "Files containing sensitive content:"
        echo "$matches" | while read -r file; do
            if [ -n "$file" ]; then
                echo "  File: $file"
                # Show the actual matches with line numbers (limit to first 3)
                grep -n "$pattern" "$file" 2>/dev/null | head -3 | sed 's/^/    /' || true
                local match_count
                match_count=$(grep -c "$pattern" "$file" 2>/dev/null || echo "0")
                if [ "$match_count" -gt 3 ]; then
                    echo "    ... and $((match_count - 3)) more matches"
                fi
            fi
        done
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
    else
        echo -e "${GREEN}No $description found${NC}"
    fi
    echo ""
}

# Function to parse and scan for sensitive domains
scan_sensitive_domains() {
    echo -e "${BLUE}Scanning for sensitive domains...${NC}"
    echo ""
    
    # Convert comma-separated domains to array
    IFS=',' read -ra DOMAIN_ARRAY <<< "$SENSITIVE_DOMAINS"
    
    for domain in "${DOMAIN_ARRAY[@]}"; do
        # Trim whitespace
        domain=$(echo "$domain" | xargs)
        
        if [ -n "$domain" ]; then
            # Escape special regex characters in the domain
            escaped_domain=$(echo "$domain" | sed 's/\./\\./g')
            
            # Check for the domain pattern
            check_pattern "$escaped_domain" "references to sensitive domain: $domain" "."
        fi
    done
}

# Function to show scan configuration
show_config() {
    echo -e "${BLUE}Scan Configuration:${NC}"
    echo "  Sensitive domains: ${SENSITIVE_DOMAINS:-'(not set)'}"
    echo "  Excluded directories: $SCAN_EXCLUDE_DIRS"
    echo "  Excluded files: $SCAN_EXCLUDE_FILES"
    echo "  Scanning from: $(pwd)"
    echo ""
}

# Main scanning function
main() {
    echo "Security scan starting at $(date)"
    echo ""
    
    # Validate configuration and determine scan mode
    determine_scan_config
    
    # Scan for sensitive domains from environment variable
    scan_sensitive_domains
    
    # Additional hardcoded patterns that are always checked
    echo -e "${BLUE}Scanning for additional sensitive patterns...${NC}"
    echo ""
    
    # Check for potential AWS role ARNs with internal account IDs (common pattern)
    check_pattern "arn:aws:iam::[0-9]{12}:role.*internal" "Internal AWS role ARNs" "."
    
    # Check for Slack channels that might be internal
    check_pattern "#[a-zA-Z0-9_-]*-internal" "Internal Slack channel references" "."
    
    # Check for common internal keywords in URLs
    check_pattern "https://[a-zA-Z0-9.-]*internal[a-zA-Z0-9.-]*" "URLs containing 'internal'" "."
    
    # Summary
    echo "=================================================="
    if [ $VIOLATIONS -eq 0 ]; then
        echo -e "${GREEN}Security scan PASSED - No sensitive content found!${NC}"
        
        # Count scanned files for reporting
        local file_count
        file_count=$(find . -type f \( -name "*.md" -o -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.js" -o -name "*.ts" -o -name "*.sh" -o -name "*.py" -o -name "*.txt" \) | grep -v -E "(\\.git/|node_modules/|\\.gitlab/scripts/)" | wc -l)
        echo "Scanned approximately $file_count files"
        exit $EXIT_SUCCESS
    else
        echo -e "${RED}Security scan FAILED - Found $VIOLATIONS violation(s)${NC}"
        echo ""
        echo -e "${YELLOW}Remediation steps:${NC}"
        echo "1. Remove or sanitize the sensitive content"
        echo "2. Use environment variables for sensitive values"
        echo "3. Move sensitive content to private configuration files"
        echo "4. If content is intentional, add exclusions to the scan configuration"
        echo ""
        echo -e "${YELLOW}To exclude specific files or directories:${NC}"
        echo "   Set SCAN_EXCLUDE_DIRS or SCAN_EXCLUDE_FILES environment variables in GitLab CI"
        exit $EXIT_SENSITIVE_FOUND
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Security Scanner for Sensitive Content"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --dry-run      Show what would be scanned without actually scanning"
        echo ""
        echo "Environment Variables:"
        echo "  SENSITIVE_DOMAINS   Comma-separated list of sensitive domains to scan for"
        echo "  SCAN_EXCLUDE_DIRS   Space-separated list of directories to exclude"
        echo "  SCAN_EXCLUDE_FILES  Space-separated list of file patterns to exclude"
        echo ""
        echo "Example:"
        echo "  SENSITIVE_DOMAINS=\".example.dev,www.example.com\" $0"
        exit 0
        ;;
    --dry-run)
        echo "Dry run mode - showing scan configuration"
        show_config
        if [ -n "$SENSITIVE_DOMAINS" ]; then
            echo "Would scan for these sensitive domains:"
            IFS=',' read -ra DOMAIN_ARRAY <<< "$SENSITIVE_DOMAINS"
            for domain in "${DOMAIN_ARRAY[@]}"; do
                domain=$(echo "$domain" | xargs)
                if [ -n "$domain" ]; then
                    echo "  - $domain"
                fi
            done
        else
            echo -e "${YELLOW}SENSITIVE_DOMAINS not set - would exit with configuration error${NC}"
        fi
        exit 0
        ;;
esac

# Run main function
main "$@"